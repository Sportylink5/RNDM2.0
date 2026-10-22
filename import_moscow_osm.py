#!/usr/bin/env python3
"""Import real OSM building areas (ways and multipolygon relations) into cq71_buildings.

Requires: pip install osmium 'psycopg[binary]'
Source: legally acquired Moscow or larger OSM .osm.pbf extract (e.g. Geofabrik).
For ALL administrative Moscow (including New Moscow and Zelenograd), obtain an
extract that includes the full administrative boundary, not just inner-city bbox.
Uses a generous safety bounding box; surrounding Moscow Oblast buildings also
qualify until you install a true Moscow administrative boundary polygon.
DATABASE_URL must be an admin/direct Postgres URL, never put it in browser files.

Usage:
  DATABASE_URL='postgresql://...' python import_moscow_osm.py moscow.osm.pbf
"""
from __future__ import annotations
import json, os, sys
try:
    import osmium
    import psycopg
except ImportError as ex:
    raise SystemExit("Install packages: pip install osmium 'psycopg[binary]'") from ex

if len(sys.argv)!=2 or not os.environ.get('DATABASE_URL'):
    raise SystemExit('Usage: DATABASE_URL=postgresql://... python import_moscow_osm.py input.osm.pbf')

class Handler(osmium.SimpleHandler):
    def __init__(self, conn):
        super().__init__()
        self.db = conn
        self.batch = []
        self.count = 0
        self.skipped = 0
        self.geo = osmium.geom.GeoJSONFactory()

    def area(self, area):
        # Includes ordinary closed ways and relation multipolygons.
        if not area.tags.get('building') or area.tags.get('building') == 'no':
            return
        try:
            geometry = json.loads(self.geo.create_multipolygon(area))
            polys = geometry['coordinates']
            outer = polys[0][0] if geometry['type'] == 'MultiPolygon' else polys[0]
            points = [(float(x), float(y)) for x, y in outer]
            if len(points) < 4:
                return
            # Only fully contained shapes (city + safety bbox).
            if not all(36.35 <= x <= 38.50 and 54.65 <= y <= 56.20 for x, y in points):
                return
            lat = sum(y for _, y in points[:-1]) / (len(points) - 1)
            lng = sum(x for x, _ in points[:-1]) / (len(points) - 1)
            address = ', '.join(filter(None, [area.tags.get('addr:street', ''), area.tags.get('addr:housenumber', '')]))[:180]
            name = area.tags.get('name', '')[:180]
            # The pyosmium area ID encodes its origin: 2*way ID or 2*relation ID + 1.
            # This uniquely identifies both ordinary ways and multipolygon relations.
            self.batch.append((int(area.id), json.dumps(geometry, ensure_ascii=False, separators=(',', ':')), lat, lng, name, address))
            if len(self.batch) >= 500:
                self.flush()
        except (ValueError, KeyError, IndexError, TypeError, osmium.InvalidLocationError):
            self.skipped += 1

    def flush(self):
        if not self.batch:
            return
        with self.db.cursor() as cur:
            cur.execute('create temporary table if not exists cq71_import (osm_id bigint,geom_json text,lat float8,lng float8,name text,address text) on commit preserve rows')
            with cur.copy('copy cq71_import (osm_id,geom_json,lat,lng,name,address) from stdin') as cp:
                for row in self.batch:
                    cp.write_row(row)
            cur.execute('''
                insert into public.cq71_buildings(osm_id,geom,lat,lng,name,address)
                select osm_id,extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geom_json),4326),lat,lng,name,address
                from cq71_import
                on conflict(osm_id) do update set geom=excluded.geom,lat=excluded.lat,lng=excluded.lng,
                   name=excluded.name,address=excluded.address
            ''')
            cur.execute('truncate cq71_import')
        self.db.commit()
        self.count += len(self.batch)
        print(f'Imported {self.count} OSM building areas', end='\r', flush=True)
        self.batch.clear()

with psycopg.connect(os.environ['DATABASE_URL']) as db:
    handler=Handler(db)
    try:
        handler.apply_file(sys.argv[1],locations=True,idx='sparse_file_array')
        handler.flush()
    except Exception:
        db.rollback()
        raise
    print(f'\nImported {handler.count} real buildings, skipped {handler.skipped} invalid ways.')
    print('Includes closed-way and relation multipolygon buildings.')
