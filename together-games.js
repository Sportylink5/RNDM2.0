/** RNDM Together v66 — host-authoritative casual games, without paid rewards.
 * State is shared between members; games with secret roles are social/playtest modes,
 * not security-grade hidden information. No payment, stars or profile XP mutations.
 */
export const GAMES = [
 ['croc','🎨','Крокодил',2,12,'Рисуй, угадывай и зарабатывай очки'],
 ['bomb','💣','Обезвредь бомбу',2,4,'Подбирайте провода по подсказкам'],
 ['heroes','🦸','Два героя',2,2,'Порталы, переключатели и новые уровни'],
 ['meme','😂','Мем-баттл',2,12,'Придумай мем и голосуй за лучший'],
 ['escape','🔐','Побег из чата',2,6,'Командный квест из четырёх загадок'],
 ['racing','🏎️','Mini Racing',2,8,'Собирай заряд, обходи препятствия'],
 ['delivery','📦','Хаос-доставка',2,4,'Перенесите диван вместе по лабиринту'],
 ['truth','🎲','Правда или действие',2,12,'Выбор задания и смена очереди'],
 ['snake','🐍','Snake Arena',2,8,'Аркада со столкновениями и очками'],
 ['hide','🕵️','Прятки',2,8,'Несколько раундов с выбором укрытия'],
 ['kitchen','👨‍🍳','Безумная кухня',2,4,'Готовьте блюда вместе и берегите время'],
 ['music','🎵','Угадай мелодию',2,10,'Пять раундов музыкальной викторины'],
 ['tanks','🛡️','Танчики',2,8,'Укрытия, выстрелы и очки'],
 ['impostor','🎭','Кто предатель?',3,10,'Подозрения, слово и тайное голосование'],
 ['pong','🏓','Neon Pong',2,2,'Теннис со скоростью и отскоками']
].map(([id,emoji,name,min,max,description])=>({id,emoji,name,min,max,description}));
export const GAME_IDS = new Set(GAMES.map(x=>x.id));
export const getGame=id=>GAMES.find(x=>x.id===id);
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const rnd=n=>Math.floor(Math.random()*n);
const clean=v=>String(v??'').trim().slice(0,160);
const normal=v=>clean(v).toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^а-яa-z0-9]/gi,'');
const score=(s,id,pts=1)=>{s.scores[id]=(s.scores[id]||0)+pts;};
const note=(s,t)=>{s.log=[String(t).slice(0,145),...(s.log||[])].slice(0,6);};
const direction={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const opposite={up:'down',down:'up',left:'right',right:'left'};
const equal=(p,x,y)=>p&&p.x===x&&p.y===y;
const key=(x,y)=>`${x}:${y}`;
const inside=(x,y,w,h)=>x>=0&&y>=0&&x<w&&y<h;
const PHRASES=['космонавт','пицца','кот','вулкан','велосипед','дракон','радуга','пингвин','робот','чемодан','торт','замок','ракета','телескоп','шахматы','снеговик'];
const MEMES=['🐈 Кот впервые увидел огурец','😱 Когда забыл домашку','🧑‍🚀 Первый день на Марсе','🍕 Последний кусочек пиццы','🤖 Бот пытается быть человеком','🦆 Утка проходит собеседование','😴 Когда будильник звонит в понедельник'];
const TRUTHS=['Какая твоя самая смешная привычка?','Какой фильм пересматриваешь?','О чём мечтал в детстве?','Куда полетел бы прямо сейчас?','Какой был самый странный сон?','Какую суперсилу выбрал бы?','С каким персонажем поменялся бы местами?'];
const DARES=['Изобрази робота голосом','Придумай рекламу ложки','Скажи пять комплиментов подряд','Покажи пантомимой животное','Расскажи историю тремя эмодзи','Придумай девиз для вашей команды','Говори как диктор новостей целую минуту'];
const ESCAPE=[
 {title:'🔑 Комната замков',riddle:'Записка: «4 окна, 8 дверей и 2 ключа». Какой трёхзначный код?',hint:'Порядок предметов указан в тексте.',answer:'482'},
 {title:'🌙 Зал зеркал',riddle:'На зеркале написано «АНУЛ». Прочитайте задом наперёд.',hint:'Это видно в ночном небе.',answer:'луна'},
 {title:'🕰️ Часовая башня',riddle:'Сколько дней в обычной неделе? Введите число.',hint:'Посчитайте дни с понедельника по воскресенье.',answer:'7'},
 {title:'🚪 Последняя дверь',riddle:'Сколько углов останется у квадратного листа, если отрезать один угол?',hint:'В месте среза появляются два новых угла.',answer:'5'}
];
const KITCHEN_RECIPES=[['🥗 Салат','🥬','🥕'],['🍲 Суп','🥔','🍅'],['🍔 Бургер','🥯','🥩'],['🍕 Пицца','🧀','🍅']];
const BOMB_WIRES=['красный','синий','жёлтый','зелёный'];
const BOMB_CLUES=[
 ['Сначала тот, что похож на небо.','синий'],
 ['Теперь цвет солнечного света.','жёлтый'],
 ['Последний — цвет травы.','зелёный']
];
const HERO_LEVELS=[
 {walls:['3:1','3:2','5:3','5:4'],plate:[4,4],door:[6,2]},
 {walls:['2:1','2:2','5:1','6:1','4:4','5:4'],plate:[4,1],door:[7,3]},
 {walls:['3:0','3:1','3:2','6:4','6:5','6:6'],plate:[5,3],door:[6,3]}
];
export const MELODIES=[
 {name:'Ода к радости',notes:[64,64,65,67,67,65,64,62,60,60,62,64,64,62,62]},
 {name:'В траве сидел кузнечик',notes:[64,64,64,64,62,64,65,67,67,65,64,62]},
 {name:'Маленькая ночная серенада',notes:[67,62,67,62,67,62,67,71,74,72,71,69]},
 {name:'Турецкий марш',notes:[71,69,68,69,72,74,76,74,72,71,69]},
 {name:'К Элизе',notes:[76,75,76,75,76,71,74,72,69]}
];
const freshWord=old=>PHRASES[(PHRASES.indexOf(old)+1+rnd(PHRASES.length-1))%PHRASES.length];
const base={status:'waiting',turn:0,log:[],scores:{},winner:null,round:1};
export function initial(game){
 if(!GAME_IDS.has(game))throw Error('Unknown RNDM game');
 const s={...structuredClone(base),game,created:Date.now()};
 switch(game){
 case 'croc':Object.assign(s,{word:PHRASES[rnd(PHRASES.length)],paths:[],guesses:[],drawer:null,maxRounds:5});break;
 case 'bomb':Object.assign(s,{wires:BOMB_WIRES,cut:[],stage:0,mistakes:0,seconds:100,elapsed:0});break;
 case 'heroes':Object.assign(s,{level:0,positions:{},walls:HERO_LEVELS[0].walls,plate:HERO_LEVELS[0].plate,door:HERO_LEVELS[0].door,doorOpen:false});break;
 case 'meme':Object.assign(s,{prompt:MEMES[rnd(MEMES.length)],captions:{},votes:{},phase:'write',round:1,maxRounds:3});break;
 case 'escape':Object.assign(s,{step:0,attempts:0,hints:0});break;
 case 'racing':Object.assign(s,{cars:{},track:120,obstacles:[{at:30,lane:0},{at:50,lane:1},{at:75,lane:2},{at:100,lane:1}]});break;
 case 'delivery':Object.assign(s,{box:{x:1,y:2,rot:0},steps:0,damage:0,lastMover:null,stamina:{},obstacles:['3:1','3:2','3:3','5:0','5:1','5:4'],goal:{x:8,y:2}});break;
 case 'truth':Object.assign(s,{question:TRUTHS[0],kind:'truth',asked:[],current:0,skipped:0});break;
 case 'snake':Object.assign(s,{snakes:{},food:{x:8,y:5},accumulator:0,elapsed:0});break;
 case 'hide':Object.assign(s,{spot:null,tried:[],seekCount:0,phase:'hide',hider:null,maxRounds:3});break;
 case 'kitchen':Object.assign(s,{orders:0,progress:0,phase:'slice',recipe:0,seconds:115,elapsed:0,combo:0,lastChef:null});break;
 case 'music':Object.assign(s,{song:rnd(MELODIES.length),answered:{},round:1,maxRounds:5,used:[]});break;
 case 'tanks':Object.assign(s,{tanks:{},shots:[],walls:['3:2','3:3','7:2','7:3','5:1','5:5'],maxTurns:200,turns:0});break;
 case 'impostor':Object.assign(s,{secret:PHRASES[rnd(PHRASES.length)],traitor:null,votes:{},phase:'talk',round:1,maxRounds:3,reported:[]});break;
 case 'pong':Object.assign(s,{paddles:[0.5,0.5],ball:{x:.5,y:.5,vx:.017,vy:.013},score:[0,0],rallies:0,accumulator:0});break;
 }
 return s;
}
export function startGame(state,players){
 const game=getGame(state?.game);
 if(!game||!Array.isArray(players)||new Set(players).size!==players.length||players.length<game.min||players.length>game.max)throw Error('Некорректный состав игроков');
 const s=structuredClone(state);s.status='playing';s.players=[...players];s.log=['Игра началась!'];s.started=Date.now();s.scores={};
 players.forEach((id,i)=>{s.scores[id]=0;
  if(s.game==='heroes')s.positions[id]={x:i===0?0:9,y:i===0?0:6};
  if(s.game==='snake')s.snakes[id]={parts:[{x:(1+i*2)%12,y:(1+i*2)%9}],dir:i%2?'left':'right',alive:true};
  if(s.game==='racing')s.cars[id]={distance:0,lane:i%3,nitro:2,energy:5,crashes:0};
  if(s.game==='tanks')s.tanks[id]={x:i%2?9:1,y:1+(i%3)*2,life:3,dir:i%2?'left':'right'};
  if(s.game==='delivery')s.stamina[id]=5;
 });
 if(s.game==='croc')s.drawer=players[0];
 if(s.game==='impostor')s.traitor=players[rnd(players.length)];
 if(s.game==='hide')s.hider=players[0];
 return s;
}
const finish=(s,msg,winner=null)=>{s.status='finished';s.winner=winner;note(s,msg);};
function nextCroc(s){s.round++;s.paths=[];s.guesses=[];if(s.round>s.maxRounds){finish(s,'Пять раундов завершены!');return;}s.word=freshWord(s.word);s.drawer=s.players[(s.round-1)%s.players.length];note(s,`Раунд ${s.round}: рисует другой игрок`);}
function nextMeme(s){s.round++;if(s.round>s.maxRounds){finish(s,'Мем-баттл завершён');return;}s.prompt=MEMES[(MEMES.indexOf(s.prompt)+1)%MEMES.length];s.captions={};s.votes={};s.phase='write';note(s,`Раунд ${s.round}`);}
function nextHide(s){s.round++;if(s.round>s.maxRounds){finish(s,'Прятки завершены!');return;}s.phase='hide';s.spot=null;s.tried=[];s.seekCount=0;s.hider=s.players[(s.round-1)%s.players.length];note(s,`Раунд ${s.round}: новый прячущийся`);}
function nextImpostor(s){s.round++;if(s.round>s.maxRounds){finish(s,'Игра в предателя завершена');return;}s.secret=freshWord(s.secret);s.traitor=s.players[rnd(s.players.length)];s.votes={};s.phase='talk';note(s,`Раунд ${s.round}`);}
function advanceMusic(s){s.used.push(s.song);s.round++;if(s.round>s.maxRounds){finish(s,'Музыкальный квиз завершён!');return;}s.song=(s.song+1)%MELODIES.length;s.answered={};note(s,`Мелодия ${s.round}`);}
function spawnFood(s){const taken=new Set(Object.values(s.snakes).flatMap(sn=>sn.parts.map(p=>key(p.x,p.y))));const vacant=[];for(let y=0;y<9;y++)for(let x=0;x<12;x++)if(!taken.has(key(x,y)))vacant.push({x,y});if(vacant.length)s.food=vacant[rnd(vacant.length)];}
function newHeroLevel(s){s.level++;if(s.level>=HERO_LEVELS.length){finish(s,'Все три уровня пройдены — командная победа!');return;}const map=HERO_LEVELS[s.level];s.walls=map.walls;s.plate=map.plate;s.door=map.door;s.doorOpen=false;s.players.forEach((id,i)=>s.positions[id]={x:i?9:0,y:i?6:0});note(s,`Уровень ${s.level+1}`);}
export function actionGame(state,player,cmd,input=''){
 if(!state||state.status!=='playing'||!state.players?.includes(player))return state;
 const s=structuredClone(state),pIndex=s.players.indexOf(player),val=clean(input);let changed=false;
 switch(s.game){
 case 'croc':{
  if(cmd==='stroke'&&player===s.drawer&&s.paths.length<180){try{const pts=JSON.parse(String(input).slice(0,2000));if(Array.isArray(pts)&&pts.length>=2&&pts.length<=40&&pts.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=100))){s.paths.push(pts);changed=true;}}catch{}}
  if(cmd==='clear'&&player===s.drawer){s.paths=[];changed=true;}
  if(cmd==='guess'&&player!==s.drawer&&val){if(s.guesses.length>=70)break;s.guesses.push({by:player,text:val.slice(0,45)});changed=true;
   if(normal(val)===normal(s.word)){score(s,player,3);score(s,s.drawer,1);note(s,`Верно! Слово: ${s.word} · +3 угадал, +1 художник`);nextCroc(s);}else note(s,`${s.players.indexOf(player)+1}-й игрок: ${val.slice(0,36)}`);
  }
  if(cmd==='skip'&&player===s.drawer){note(s,`Пропущено слово: ${s.word}`);nextCroc(s);changed=true;}
  break;}
 case 'bomb':{
  if(cmd==='cut'&&s.wires.includes(val)&&!s.cut.includes(val)){
   changed=true;s.cut.push(val);
   if(val===BOMB_CLUES[s.stage]?.[1]){s.stage++;score(s,player,2);note(s,'Верно! Модуль отключён.');if(s.stage===BOMB_CLUES.length)finish(s,'Бомба обезврежена — команда победила!');}
   else{s.mistakes++;note(s,'Неверный провод! Минус 20 секунд.');s.seconds=Math.max(0,s.seconds-20);if(s.mistakes>=2||s.seconds<=0)finish(s,'Бомба сработала!');}
  }break;}
 case 'heroes':{
  const a=s.positions[player];if(a&&direction[cmd]){const [dx,dy]=direction[cmd],x=a.x+dx,y=a.y+dy;
   if(inside(x,y,10,7)&&!s.walls.includes(key(x,y))&&(!equal(s.door,x,y)||s.doorOpen)){
    a.x=x;a.y=y;changed=true;
    const plate=s.players.some(id=>equal(s.positions[id],...s.plate));s.doorOpen=plate;
    if(equal(s.positions[s.players[0]],9,0)&&equal(s.positions[s.players[1]],0,6))newHeroLevel(s);
   }
  }break;}
 case 'meme':{
  if(cmd==='caption'&&s.phase==='write'&&val&&!s.captions[player]){s.captions[player]=val.slice(0,120);changed=true;if(Object.keys(s.captions).length===s.players.length)s.phase='vote';}
  if(cmd==='vote'&&s.phase==='vote'&&s.players.includes(val)&&s.captions[val]&&val!==player&&!s.votes[player]){
   s.votes[player]=val;changed=true;if(Object.keys(s.votes).length===s.players.length){Object.values(s.votes).forEach(id=>score(s,id));s.phase='results';note(s,'Голоса подсчитаны');}}
  if(cmd==='next'&&s.phase==='results'&&player===s.players[0]){nextMeme(s);changed=true;}break;}
 case 'escape':{
  if(cmd==='answer'&&val){changed=true;if(normal(val)===normal(ESCAPE[s.step]?.answer)){
   score(s,player,2);s.step++;note(s,'Дверь открылась!');if(s.step===ESCAPE.length)finish(s,'Вы выбрались из всех комнат!');
  }else{s.attempts++;note(s,'Код не подошёл. Подумайте вместе.');}}
  if(cmd==='hint'&&s.step<ESCAPE.length&&s.hints<=s.step){s.hints++;changed=true;note(s,`Подсказка: ${ESCAPE[s.step].hint}`);}break;}
 case 'racing':{
  const c=s.cars[player];if(!c)break;
  if((cmd==='left'||cmd==='right')&&c.energy>=0){const lane=clamp(c.lane+(cmd==='left'?-1:1),0,2);if(lane!==c.lane){c.lane=lane;changed=true;}}
  let progress=0;
  if(cmd==='gas'&&c.energy>=1){progress=4;c.energy-=1;}
  if(cmd==='nitro'&&c.nitro>0){progress=16;c.nitro--;}
  if(progress){const next=clamp(c.distance+progress,0,s.track);const obstacle=s.obstacles.find(o=>o.lane===c.lane&&o.at>c.distance&&o.at<=next);if(obstacle){c.distance=Math.max(c.distance,obstacle.at-3);c.crashes++;note(s,'💥 Препятствие! Смените полосу.');}
   else c.distance=next;
   if(c.distance>=s.track){score(s,player,5);finish(s,'Финиш! 🏁',player);}changed=true;
  }break;}
 case 'delivery':{
  const b=s.box;
  if(cmd==='rotate'){b.rot=(b.rot+1)%2;changed=true;}
  if(direction[cmd]){
   if(s.lastMover===player&&s.players.length>1){note(s,'Передай ход напарнику — груз тяжёлый!');changed=true;break;}
   const [dx,dy]=direction[cmd],x=b.x+dx,y=b.y+dy;
   if(inside(x,y,9,6)&&!s.obstacles.includes(key(x,y))){b.x=x;b.y=y;s.lastMover=player;s.steps++;score(s,player);changed=true;
    if(equal(s.goal,x,y)&&b.rot===0)finish(s,'Диван доставлен без потерь!');
   }else{note(s,'Там стена — попробуйте другой путь.');changed=true;}
  }break;}
 case 'truth':{
  if(cmd==='next'&&pIndex===s.current){s.kind=val==='dare'?'dare':'truth';const opts=s.kind==='truth'?TRUTHS:DARES;const used=s.asked.filter(x=>x.kind===s.kind).map(x=>x.question);s.question=opts.find(t=>!used.includes(t))||opts[rnd(opts.length)];s.asked.push({kind:s.kind,question:s.question});s.current=(s.current+1)%s.players.length;s.round++;note(s,`Ход игрока ${s.current+1}`);changed=true;}
  if(cmd==='skip'&&pIndex===s.current){s.skipped++;s.current=(s.current+1)%s.players.length;s.round++;note(s,'Пропуск без штрафа');changed=true;}break;}
 case 'snake':{
  const snake=s.snakes[player];if(snake?.alive&&direction[cmd]&&cmd!==opposite[snake.dir]&&cmd!==snake.dir){snake.dir=cmd;changed=true;}break;}
 case 'hide':{
  if(cmd==='hide'&&player===s.hider&&s.phase==='hide'&&['1','2','3','4','5','6'].includes(val)){s.spot=Number(val);s.phase='seek';changed=true;}
  if(cmd==='seek'&&player!==s.hider&&s.phase==='seek'&&['1','2','3','4','5','6'].includes(val)&&!s.tried.includes(Number(val))){s.tried.push(Number(val));s.seekCount++;changed=true;
   if(Number(val)===s.spot){score(s,player,3);s.phase='results';note(s,`Пойман! Укрытие ${val}`);}
   else if(s.seekCount>=3){score(s,s.hider,3);s.phase='results';note(s,'Прячущийся победил!');}else note(s,`Укрытие ${val} пустое`);
  }
  if(cmd==='next'&&s.phase==='results'&&player===s.players[0]){nextHide(s);changed=true;}break;}
 case 'kitchen':{
  if(cmd===s.phase){if(player===s.lastChef&&s.players.length>1){note(s,'Пусть напарник выполнит следующий этап!');changed=true;break;}
   s.lastChef=player;s.progress++;score(s,player);changed=true;
   if(s.progress>=2){s.progress=0;s.phase=s.phase==='slice'?'cook':s.phase==='cook'?'serve':'slice';
    if(s.phase==='slice'){s.orders++;s.combo++;note(s,`Готово: ${KITCHEN_RECIPES[s.recipe][0]}!`);s.recipe=(s.recipe+1)%KITCHEN_RECIPES.length;if(s.orders>=4)finish(s,'Кухня закрыта: 4 заказа выполнены!');}
   }
  }break;}
 case 'music':{
  if(cmd==='answer'&&!s.answered[player]&&val){s.answered[player]=val;changed=true;if(normal(val)===normal(MELODIES[s.song].name)){score(s,player,2);note(s,'Правильный ответ!');}if(Object.keys(s.answered).length===s.players.length)advanceMusic(s);}
  break;}
 case 'tanks':{
  const t=s.tanks[player];if(!t||t.life<=0)break;
  if(direction[cmd]){const [dx,dy]=direction[cmd],x=t.x+dx,y=t.y+dy;t.dir=cmd;changed=true;if(inside(x,y,11,7)&&!s.walls.includes(key(x,y))&&!Object.values(s.tanks).some(other=>other!==t&&other.life>0&&equal(other,x,y))){t.x=x;t.y=y;}}
  if(cmd==='shoot'){const [dx,dy]=direction[t.dir];for(let k=1;k<11;k++){const x=t.x+dx*k,y=t.y+dy*k;if(!inside(x,y,11,7)||s.walls.includes(key(x,y)))break;const hit=Object.entries(s.tanks).find(([id,v])=>id!==player&&v.life>0&&equal(v,x,y));if(hit){hit[1].life--;score(s,player,2);note(s,`Попадание! У игрока ${s.players.indexOf(hit[0])+1} осталось ${hit[1].life} HP`);break;}}s.turns++;changed=true;}
  if(Object.values(s.tanks).filter(t=>t.life>0).length<=1)finish(s,'Танковая битва завершена!',Object.entries(s.tanks).find(([,t])=>t.life>0)?.[0]);break;}
 case 'impostor':{
  if(cmd==='vote'&&s.phase==='talk'&&s.players.includes(val)&&!s.votes[player]){
   s.votes[player]=val;changed=true;
   if(Object.keys(s.votes).length===s.players.length){const tally={};Object.values(s.votes).forEach(id=>tally[id]=(tally[id]||0)+1);const max=Math.max(...Object.values(tally));const leaders=Object.keys(tally).filter(id=>tally[id]===max);
    const caught=leaders.length===1&&leaders[0]===s.traitor;
    (caught?s.players.filter(id=>id!==s.traitor):[s.traitor]).forEach(id=>score(s,id,2));
    s.phase='results';note(s,caught?'Предатель раскрыт!':'Предатель обманул команду!');
   }
  }
  if(cmd==='next'&&s.phase==='results'&&player===s.players[0]){nextImpostor(s);changed=true;}break;}
 case 'pong':{
  if(['up','down'].includes(cmd)){s.paddles[pIndex]=clamp(s.paddles[pIndex]+(cmd==='up'?-0.085:0.085),0.12,0.88);changed=true;}
  break;}
 }
 return changed?s:state;
}
function tickSnake(s){
 const snakes=Object.entries(s.snakes).filter(([,a])=>a.alive);
 const targets=new Map();for(const [id,a] of snakes){const [dx,dy]=direction[a.dir];targets.set(id,{x:(a.parts[0].x+dx+12)%12,y:(a.parts[0].y+dy+9)%9});}
 const doomed=new Set();for(const [id,t] of targets){
  if([...targets].some(([other,p])=>other!==id&&equal(p,t.x,t.y)))doomed.add(id);
  if(Object.entries(s.snakes).some(([other,a])=>a.parts.some((p,i)=>i<(a.parts.length-(other===id&&!equal(s.food,t.x,t.y)?1:0))&&equal(p,t.x,t.y))))doomed.add(id);
 }
 for(const [id,a] of snakes){if(doomed.has(id)){a.alive=false;note(s,`Игрок ${s.players.indexOf(id)+1} выбыл`);continue;}const next=targets.get(id);a.parts.unshift(next);if(equal(s.food,next.x,next.y)){score(s,id,2);spawnFood(s);}else a.parts.pop();}
 const alive=Object.entries(s.snakes).filter(([,a])=>a.alive);
 if(alive.length<=1){const champ=alive[0]?.[0]||null;if(champ)score(s,champ,3);finish(s,'Snake Arena: раунд завершён!',champ);}
}
function tickPong(s,dt){const b=s.ball;const steps=Math.max(1,Math.ceil(dt/.08));for(let i=0;i<steps;i++){
 const delta=dt/steps/.12;b.x+=b.vx*delta;b.y+=b.vy*delta;
 if(b.y<.032){b.y=.032;b.vy=Math.abs(b.vy);}if(b.y>.968){b.y=.968;b.vy=-Math.abs(b.vy);}
 for(const side of [0,1]){const edge=side===0?.045:.955,passed=side===0?b.x<=edge:b.x>=edge;if(!passed)continue;
  const paddle=s.paddles[side];if(Math.abs(b.y-paddle)<=.145){b.x=edge;b.vx=(side===0?1:-1)*Math.min(.05,Math.abs(b.vx)*1.055);b.vy=clamp(b.vy+(b.y-paddle)*.02,-.05,.05);s.rallies++;}
  else{const victor=1-side;s.score[victor]++;b.x=.5;b.y=.5;b.vx=(side===0?.018:-.018);b.vy=(s.score[0]+s.score[1])%2?.012:-.012;s.rallies=0;
   if(s.score[victor]>=5)finish(s,'Neon Pong: матч окончен!',s.players[victor]);return;}
 }
 }}
/** dt in seconds. Server/host is the only caller responsible for authoritative time. */
export function tickGame(state,dt=.24){
 if(!state||state.status!=='playing')return state;
 if(!['snake','pong','bomb','kitchen','racing'].includes(state.game))return state;
 const s=structuredClone(state),elapsed=clamp(Number(dt)||0,.01,1);
 if(s.game==='snake'){s.accumulator=(s.accumulator||0)+elapsed;s.elapsed=(s.elapsed||0)+elapsed;
  if(s.accumulator>=.36){s.accumulator-=.36;tickSnake(s);}if(s.elapsed>130&&s.status==='playing')finish(s,'Время вышло — победа по очкам.');}
 if(s.game==='pong')tickPong(s,elapsed);
 if(s.game==='racing')for(const car of Object.values(s.cars))car.energy=clamp(car.energy+elapsed*2,0,5);
 if(s.game==='bomb'||s.game==='kitchen'){s.elapsed=(s.elapsed||0)+elapsed;if(s.elapsed>=1){const steps=Math.floor(s.elapsed);s.elapsed-=steps;s.seconds=Math.max(0,s.seconds-steps);if(s.seconds<=0)finish(s,s.game==='bomb'?'Бомба сработала!':'Кухня закрылась — время вышло!');}}
 return s;
}
export function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
export const GAME_META={escape:ESCAPE,kitchen:KITCHEN_RECIPES,bomb:BOMB_CLUES,heroes:HERO_LEVELS};
