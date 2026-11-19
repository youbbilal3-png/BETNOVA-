import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLanguage } from '../i18n'
import '../games-hub.css'
import { ArrowRight, Crown, Gem, Grid3X3, Play, Sparkles, X, Zap, RotateCw } from 'lucide-react'

type Category = 'all' | 'games' | 'slots' | 'casino'
type Game = { id:string; name:string; category:Exclude<Category,'all'>; tag:string; description:string; art:string; accent:string; mark:string }

const games:Game[] = [
  {id:'crash',name:'CRASH',category:'games',tag:'INSTANT GAME',description:'Start a free round, watch the practice multiplier rise and choose when to stop.',art:'rocket',accent:'coral',mark:'🚀'},
  {id:'apple',name:'APPLE OF FORTUNE',category:'games',tag:'SKILL & LUCK',description:'Pick one safe apple in each of five rows while avoiding the hidden trap. Free practice only.',art:'apple',accent:'lime',mark:'🍏'},
  {id:'plinko',name:'PLINKO',category:'games',tag:'INSTANT GAME',description:'Drop a practice ball through a pin field and reveal its landing slot.',art:'plinko',accent:'cyan',mark:'🔮'},
  {id:'lucky-fruits',name:'LUCKY FRUITS',category:'slots',tag:'CLASSIC SLOTS',description:'A bright fruit-machine theme with polished reels, rich symbols and a modern arcade finish.',art:'fruits',accent:'pink',mark:'🍒'},
  {id:'pharaoh',name:"PHARAOH'S GOLD",category:'slots',tag:'ADVENTURE SLOTS',description:'An elegant ancient-Egypt inspired slot concept with gold, lapis tones and royal symbols.',art:'pharaoh',accent:'gold',mark:'𓂀'},
  {id:'space-spin',name:'SPACE SPIN',category:'slots',tag:'COSMIC SLOTS',description:'A futuristic slot concept with planets, glowing stars and a deep-space atmosphere.',art:'space',accent:'violet',mark:'🪐'},
  {id:'roulette',name:'EUROPEAN ROULETTE',category:'casino',tag:'TABLE CLASSIC',description:'A refined single-zero roulette table concept with a clean, readable layout.',art:'roulette',accent:'green',mark:'🎡'},
  {id:'blackjack',name:'BLACKJACK',category:'casino',tag:'CARD TABLE',description:'A classic 21 card-table concept with premium felt, clear cards and a calm table design.',art:'cards',accent:'blue',mark:'♠'},
  {id:'baccarat',name:'BACCARAT',category:'casino',tag:'CARD TABLE',description:'A sophisticated Player-versus-Banker table concept with a minimal casino presentation.',art:'baccarat',accent:'gold',mark:'♦'},
]

const categoryIcons:Record<Category,typeof Grid3X3>={all:Grid3X3,games:Zap,slots:Gem,casino:Crown}
const arabicDescriptions:Record<string,string>={crash:'ابدأ جولة تدريبية مجانية، راقب المضاعف واختر وقت التوقف.',apple:'خمسة صفوف مليئة بالتفاحات. اختر تفاحة آمنة في كل صف وتجنب التفاحة المخفية.',plinko:'أسقط كرة تدريبية عبر المسامير وشاهد خانة الهبوط.', 'lucky-fruits':'تصميم فواكه كلاسيكي بألوان زاهية وبكرات عصرية.',pharaoh:'أجواء مصرية قديمة أنيقة مع الذهب والرموز الملكية.','space-spin':'تصميم فضائي مستقبلي بالكواكب والنجوم والألوان المتوهجة.',roulette:'تصميم أنيق لعجلة روليت أوروبية ذات صفر واحد.',blackjack:'تصميم لطاولة بلاك جاك بأوراق واضحة وأجواء راقية.',baccarat:'تصميم أنيق لطاولة باكارات بين اللاعب والمصرف.'}
const choose=<T,>(items:T[])=>items[Math.floor(Math.random()*items.length)]
const APPLE_ROWS=5, APPLE_COLUMNS=5
const newAppleTraps=()=>Array.from({length:APPLE_ROWS},()=>Math.floor(Math.random()*APPLE_COLUMNS))
const rouletteReds=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
const drawCard=()=>{const value=Math.floor(Math.random()*13)+1;return value===1?11:Math.min(value,10)}
const cardLabel=(value:number)=>value===11?'A':String(value)
const baccaratValue=(value:number)=>value===11?1:value>=10?0:value
const baccaratTotal=(hand:number[])=>hand.reduce((sum,value)=>sum+baccaratValue(value),0)%10

export default function GamesHub({initialGameRequest}:{initialGameRequest?:{id:string;token:number}|null}){
  const {language}=useLanguage()
  const arabic=language==='ar'
  const labels={all:t('all_games'),games:t('games'),slots:t('slots'),casino:t('casino'),heading:arabic?'ادخل إلى':'ENTER THE',zone:t('game_zone'),subtitle:arabic?'اكتشف بُعداً جديداً من الترفيه.':'Discover a new dimension of play.',explore:t('explore_game'),safety:arabic?'تجارب تدريبية مجانية فقط. لا توجد إيداعات أو رهانات أو سحوبات أو جوائز أو أموال حقيقية.':'Free practice demonstrations only. No deposits, wagers, cash-out value, prizes or real-money play are enabled.',practice:t('free_practice'),demo:t('demo_mode'),start:t('start_practice'),next:t('next_step'),stop:t('stop_now'),pick:t('pick_apple'),drop:t('drop_ball'),tryDemo:t('try_demo'),reset:t('reset_practice'),close:t('close')}
  const [category,setCategory]=useState<Category>('all')
  const [selected,setSelected]=useState<Game|null>(null)
  const [practiceResult,setPracticeResult]=useState('')
  const [practiceCount,setPracticeCount]=useState(0)
  const [crashAt,setCrashAt]=useState(0)
  const [multiplier,setMultiplier]=useState(1)
  const [crashActive,setCrashActive]=useState(false)
  const [crashExploding,setCrashExploding]=useState(false)
  const [crashCountdown,setCrashCountdown]=useState<number|null>(null)
  const [appleLevel,setAppleLevel]=useState(0)
  const [appleDone,setAppleDone]=useState(false)
  const [appleTraps,setAppleTraps]=useState<number[]>(()=>newAppleTraps())
  const [applePicks,setApplePicks]=useState<number[]>([])
  const [plinkoSlot,setPlinkoSlot]=useState<number|null>(null)
  const [plinkoDropping,setPlinkoDropping]=useState(false)
  const [slotSymbols,setSlotSymbols]=useState<string[]>(['🍒','⭐','🍋'])
  const [slotSpinning,setSlotSpinning]=useState(false)
  const slotTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const modalRef=useRef<HTMLElement|null>(null)
  const [rouletteNumber,setRouletteNumber]=useState<number|null>(null)
  const [rouletteSpinning,setRouletteSpinning]=useState(false)
  const [cardHand,setCardHand]=useState<number[]>([])
  const [dealerHand,setDealerHand]=useState<number[]>([])
  const [blackjackDone,setBlackjackDone]=useState(false)
  const [baccaratHand,setBaccaratHand]=useState<{player:number[];banker:number[]}|null>(null)
  const visible=games.filter(game=>category==='all'||game.category===category)
  const resetDemo=()=>{
    if(slotTimer.current)clearTimeout(slotTimer.current);slotTimer.current=null;setSlotSpinning(false)
    setPracticeResult('');setPracticeCount(0);setCrashAt(0);setMultiplier(1)
    setCrashActive(false);setCrashExploding(false);setCrashCountdown(null);setAppleLevel(0);setAppleDone(false);setAppleTraps(newAppleTraps());setApplePicks([]);setPlinkoSlot(null);setPlinkoDropping(false)
    setSlotSymbols(['🍒','⭐','🍋']);setRouletteNumber(null);setRouletteSpinning(false);setCardHand([]);setDealerHand([]);setBlackjackDone(false);setBaccaratHand(null)
  }
  useEffect(()=>{if(!initialGameRequest)return;const target=games.find(game=>game.id===initialGameRequest.id);if(target){setCategory('games');setSelected(target);resetDemo()}},[initialGameRequest])
  const closeGame=()=>{const modalHistory=Boolean(window.history.state?.betnovaGameModal);setSelected(null);resetDemo();if(modalHistory)window.history.back()}
  useEffect(()=>{if(!selected)return;const current=window.history.state;if(!current?.betnovaGameModal)window.history.pushState({...current,betnovaPage:'games',betnovaGameModal:true},'', '#game');const onPop=()=>{setSelected(null);resetDemo()};window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[selected])
  useEffect(()=>{if(!selected)return;const previous=document.activeElement as HTMLElement|null;modalRef.current?.focus();const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'){closeGame();return}if(event.key==='Tab'){const nodes=modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])');if(!nodes?.length){event.preventDefault();modalRef.current?.focus();return}const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}};window.addEventListener('keydown',onKeyDown);return()=>{window.removeEventListener('keydown',onKeyDown);if(slotTimer.current)clearTimeout(slotTimer.current);slotTimer.current=null;previous?.focus()}},[selected])
  useEffect(()=>{if(!crashActive)return;const timer=window.setTimeout(()=>{const next=Number((multiplier+0.05).toFixed(2));setMultiplier(next);if(next>=crashAt){setCrashActive(false);setCrashExploding(true);setPracticeResult(arabic?`انفجرت المروحية عند ${next.toFixed(2)}×. جولة تدريبية جديدة بعد العد التنازلي.`:`Helicopter crashed at ${next.toFixed(2)}×. A new practice round starts after the countdown.`)}},220);return()=>window.clearTimeout(timer)},[crashActive,crashAt,multiplier,arabic])
  const startCrash=()=>{
    setCrashAt(1.25+Math.random()*4.75);setMultiplier(1);setCrashExploding(false);setCrashCountdown(null);setCrashActive(true)
    setPracticeResult(arabic?'بدأ المضاعف. تقدّم بحذر أو أوقف الجولة التدريبية.':'Multiplier is live. Advance carefully or stop this practice round.')
    setPracticeCount(value=>value+1)
  }
  useEffect(()=>{if(!crashExploding)return;const timer=window.setTimeout(()=>{setCrashExploding(false);setCrashCountdown(7)},950);return()=>window.clearTimeout(timer)},[crashExploding])
  useEffect(()=>{if(crashCountdown===null)return;if(crashCountdown===0){setCrashCountdown(null);startCrash();return}const timer=window.setTimeout(()=>setCrashCountdown(value=>value===null?null:value-1),1000);return()=>window.clearTimeout(timer)},[crashCountdown])
  const cashOutCrash=()=>{
    if(!crashActive)return
    setCrashActive(false)
    setPracticeResult(arabic?`أوقفت الجولة عند ${multiplier.toFixed(2)}×. نتيجة للعرض فقط دون أرباح.`:`Practice stop at ${multiplier.toFixed(2)}×. Display-only result; no winnings were created.`)
  }
  const pickApple=(column:number)=>{
    if(appleDone||appleLevel>=APPLE_ROWS)return
    setApplePicks(current=>[...current,column])
    if(column===appleTraps[appleLevel]){setAppleDone(true);setPracticeResult(arabic?`وجدت التفاحة الخطرة في الصف ${appleLevel+1}. انتهت الجولة التدريبية.`:`Trap apple found in row ${appleLevel+1}. Practice round over.`)}
    else{const next=appleLevel+1;setAppleLevel(next);if(next>=APPLE_ROWS){setAppleDone(true);setPracticeResult(arabic?'خمسة اختيارات آمنة! اكتملت الجولة التدريبية دون جوائز أو رصيد.':'Five safe picks! Practice round completed with no prize or balance award.')}else setPracticeResult(arabic?`اختيار آمن! انتقل إلى الصف ${next+1}.`:`Safe pick! Continue to row ${next+1}.`)}
    setPracticeCount(value=>value+1)
  }
  const dropPlinko=()=>{
    if(plinkoDropping)return
    const slot=Math.floor(Math.random()*9)+1
    setPlinkoDropping(true);setPlinkoSlot(null);setPracticeResult(arabic?'الكرة تهبط عبر المسامير...':'Ball dropping through the pegs...')
    slotTimer.current=setTimeout(()=>{setPlinkoSlot(slot);setPlinkoDropping(false);setPracticeCount(value=>value+1);setPracticeResult(arabic?`استقرت الكرة في الخانة ${slot} من أصل 9. لا توجد جائزة أو إضافة رصيد.`:`The practice ball landed in slot ${slot} of 9. No prize or balance was awarded.`);slotTimer.current=null},950)
  }
  const blackjackTotal=(hand:number[])=>{let total=hand.reduce((sum,value)=>sum+(value===11?1:value),0);if(hand.includes(11)&&total+10<=21)total+=10;return total}
  const blackjackHit=()=>{if(blackjackDone)return;const card=drawCard();const next=[...cardHand,card];setCardHand(next);const total=blackjackTotal(next);if(total>=21){setBlackjackDone(true);setPracticeResult(arabic?`مجموع أوراقك ${total}. ${total>21?'تجاوزت 21!':'وصلت إلى 21.'} انتهت الجولة التدريبية.`:`Your hand totals ${total}. ${total>21?'Bust!':'21 reached.'} Practice round complete.`)}else setPracticeResult(arabic?`أضفت ورقة. مجموعك الآن ${total}.`:`Card drawn. Your total is ${total}.`);setPracticeCount(value=>value+1)}
  const blackjackStand=()=>{if(blackjackDone||cardHand.length===0)return;let dealer=[...dealerHand];while(blackjackTotal(dealer)<17)dealer.push(drawCard());setDealerHand(dealer);setBlackjackDone(true);const player=blackjackTotal(cardHand),banker=blackjackTotal(dealer);const outcome=player>21?'bust':banker>21||player>banker?'win':player===banker?'tie':'lose';setPracticeResult(arabic?`مجموعك ${player} · الموزع ${banker} · ${outcome==='win'?'فزت في التدريب':outcome==='tie'?'تعادل':'انتهت الجولة'}. دون أموال أو جوائز.`:`You ${player} · Dealer ${banker} · ${outcome.toUpperCase()}. Practice only; no money or prizes.`);setPracticeCount(value=>value+1)}
  const spinRoulette=()=>{if(rouletteSpinning)return;const n=Math.floor(Math.random()*37);setRouletteNumber(null);setRouletteSpinning(true);setPracticeResult(arabic?'تدور العجلة...':'Wheel spinning...');slotTimer.current=setTimeout(()=>{setRouletteNumber(n);const color=n===0?'GREEN':rouletteReds.has(n)?'RED':'BLACK';setPracticeResult(arabic?`نتيجة العجلة التدريبية: ${n} · ${color==='GREEN'?'أخضر':color==='RED'?'أحمر':'أسود'}. ليست نتيجة رهان حقيقي.`:`Practice wheel: ${n} · ${color}. No real roulette result.`);setPracticeCount(value=>value+1);setRouletteSpinning(false);slotTimer.current=null},1250)}
  const spinSlots=()=>{if(!selected||slotSpinning)return;const symbols=selected.id==='lucky-fruits'?['🍒','🍋','🍉','🍇','⭐','7️⃣']:selected.id==='pharaoh'?['𓂀','👑','⚱️','🐪','💎','☀️']:['🪐','🌟','🚀','🌙','💫','👾'];const reels=[choose(symbols),choose(symbols),choose(symbols)];setSlotSpinning(true);setPracticeResult(arabic?'تدور البكرات...':'Reels spinning...');slotTimer.current=setTimeout(()=>{setSlotSymbols(reels);const match=reels.every(s=>s===reels[0]);setPracticeResult(arabic?`نتيجة اللف: ${reels.join('  ')}. ${match?'تطابق رمزي في العرض التجريبي!':'لا يوجد تطابق هذه المرة.'} لا توجد أرباح أو جوائز.`:`Practice spin: ${reels.join('  ')}. ${match?'Three matching symbols!':'No match this time.'} Display-only; no payout.`);setPracticeCount(value=>value+1);setSlotSpinning(false);slotTimer.current=null},850)}
  const runOtherDemo=()=>{
    if(!selected)return
    let result=''
    switch(selected.id){
      case 'lucky-fruits': case 'pharaoh': case 'space-spin': return spinSlots();
      case 'roulette': return spinRoulette();
      case 'blackjack': {const cards=[drawCard(),drawCard()];setCardHand(cards);setDealerHand([drawCard()]);const total=blackjackTotal(cards);const natural=total===21;setBlackjackDone(natural);result=arabic?`بدأت الجولة. مجموع أوراقك ${total}. ${natural?'21! انتهت الجولة تلقائياً.':'اسحب ورقة أو قف.'}`:`New practice hand. Your total is ${total}. ${natural?'21! Round complete.':'Hit or stand.'}`;break}
      case 'baccarat': {const player=[drawCard(),drawCard()],banker=[drawCard(),drawCard()];let pt=baccaratTotal(player),bt=baccaratTotal(banker);if(pt<8&&bt<8){let playerThird:number|undefined;if(pt<=5){playerThird=drawCard();player.push(playerThird);pt=baccaratTotal(player)}const bankerDraw=playerThird===undefined?bt<=5:bt<=2||bt===3&&baccaratValue(playerThird)!==8||bt===4&&baccaratValue(playerThird)>=2&&baccaratValue(playerThird)<=7||bt===5&&baccaratValue(playerThird)>=4&&baccaratValue(playerThird)<=7||bt===6&&(baccaratValue(playerThird)===6||baccaratValue(playerThird)===7);if(bankerDraw){banker.push(drawCard());bt=baccaratTotal(banker)}}setBaccaratHand({player,banker});const winner=pt===bt?'tie':pt>bt?'player':'banker';result=arabic?`اللاعب ${player.map(cardLabel).join('، ')} = ${pt} · المصرف ${banker.map(cardLabel).join('، ')} = ${bt} · ${winner==='tie'?'تعادل':winner==='player'?'فوز اللاعب':'فوز المصرف'}. تدريب فقط.`:`Player ${player.map(cardLabel).join(', ')} = ${pt} · Banker ${banker.map(cardLabel).join(', ')} = ${bt} · ${winner.toUpperCase()}. Practice only.`;break}
    }
    setPracticeResult(result);setPracticeCount(value=>value+1)
  }
  return <section className="games-hub" id="games">
    <div className="games-hub-head">
      <div><div className="games-kicker"><Sparkles size={14}/> BETNOVA ARCADE</div><h2>{labels.heading} <em>{labels.zone}</em></h2><p>{labels.subtitle}</p></div>
      <div className="games-head-orb" aria-hidden="true"><span>BN</span></div>
    </div>
    <div className="games-category-tabs" role="tablist" aria-label="Game categories">
      {(['all','games','slots','casino'] as Category[]).map(key=>{const Icon=categoryIcons[key];return <button key={key} type="button" role="tab" aria-selected={category===key} className={category===key?'active':''} onClick={()=>setCategory(key)}><Icon size={15}/>{labels[key]}<span>{key==='all'?games.length:games.filter(game=>game.category===key).length}</span></button>})}
    </div>
    <div className="games-grid">
      {visible.map((game,index)=><article className={`game-tile game-${game.accent}`} key={game.id} style={{'--game-index':index} as CSSProperties}>
        <div className={`game-art art-${game.art}`} aria-hidden="true">
          <div className="game-art-glow"/><div className="game-art-object">{game.mark}</div>
          <span className="game-art-orbit orbit-one"/><span className="game-art-orbit orbit-two"/>
          <span className="game-art-shine">✦</span><span className="game-art-code">BETNOVA / PLAY</span>
        </div>
        <div className="game-tile-copy"><div className="game-tile-meta"><span>{game.tag}</span><span className="game-live-dot"/></div><h3>{game.name}</h3><p>{arabic?(arabicDescriptions[game.id]??game.description):game.description}</p><button type="button" onClick={()=>{setSelected(game);resetDemo()}}>{labels.explore} <ArrowRight size={14}/></button></div>
      </article>)}
    </div>
    <div className="games-safety-note"><Sparkles size={15}/><span>{labels.safety}</span></div>
    {selected&&<div className="game-detail-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)closeGame()}}>
      <section ref={modalRef} tabIndex={-1} className={`game-detail-modal game-${selected.accent}`} role="dialog" aria-modal="true" aria-labelledby="game-detail-title">
        <div className="game-detail-close-row"><button className="game-detail-close" type="button" onClick={closeGame} aria-label={labels.close}><X size={20}/></button></div>
        {selected.id!=='crash'&&<div className={`game-detail-art art-${selected.art}`}><span>{selected.mark}</span><i/><b>BETNOVA</b></div>}
        <div className="games-kicker"><Sparkles size={14}/> {labels.practice} · {selected.tag}</div><h3 id="game-detail-title">{selected.name}</h3><p>{arabic?(arabicDescriptions[selected.id]??selected.description):selected.description}</p>
        <div className="game-coming-soon"><Play size={15}/> {labels.demo}</div>
        {selected.id==='crash'&&<div className="game-practice-controls crash-controls">
          <div className={`crash-flight-stage ${crashActive?'is-flying':crashExploding?'is-exploding':multiplier>1?'flight-ended':'flight-ready'}`} style={{'--crash-flight-duration':`${Math.max(1,(crashAt-1)*4.4)}s`,'--crash-heli-left':`${5+Math.max(0,Math.min(1,(crashAt-1)/5.75))*67}%`,'--crash-heli-top':`${66-Math.max(0,Math.min(1,(crashAt-1)/5.75))*45}%`} as CSSProperties} role="img" aria-label={arabic?'طائرة كراش تطير داخل مسار ثلاثي الأبعاد':'Crash airplane flying through a 3D flight arena'}>
            <div className="crash-sky-grid"/><div className="crash-sun-glow"/><div className="crash-cloud cloud-a"/><div className="crash-cloud cloud-b"/>
            <div className="crash-mountains mountain-back"/><div className="crash-mountains mountain-front"/>
            <div className="crash-flight-path"/><div className="crash-flight-trail"/>
            <div className={`crash-helicopter ${crashActive?'helicopter-flying':crashExploding?'helicopter-crashed':'helicopter-idle'}`} aria-hidden="true">
              <svg viewBox="0 0 180 120">
                <defs>
                  <linearGradient id="bnHeliBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a8ffe7"/><stop offset=".42" stopColor="#20c99b"/><stop offset="1" stopColor="#08765f"/></linearGradient>
                  <linearGradient id="bnHeliGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b9f6ff"/><stop offset="1" stopColor="#256e9d"/></linearGradient>
                </defs>
                <g className="heli-rotor"><path d="M88 26 L92 26 L92 13 L88 13Z" fill="#d8fff6"/><path d="M38 12 Q90 3 142 12" fill="none" stroke="#d8fff6" strokeWidth="4" strokeLinecap="round"/><path d="M54 17 Q90 12 126 17" fill="none" stroke="#42e5bd" strokeWidth="2" strokeLinecap="round"/></g>
                <path d="M46 65 L16 58 L12 62 L45 72Z" fill="#1cbf9b" stroke="#9affdf" strokeWidth="2"/>
                <path d="M17 55 L9 48 L7 51 L12 60Z" fill="#9affdf"/><path d="M15 61 L5 68 L9 71 L18 65Z" fill="#9affdf"/>
                <path d="M39 67 Q45 43 79 42 L112 46 Q133 49 139 69 Q136 91 112 94 L61 93 Q36 90 39 67Z" fill="url(#bnHeliBody)" stroke="#b8ffe9" strokeWidth="2.5"/>
                <path d="M83 47 Q110 42 125 57 L130 73 L91 73Z" fill="url(#bnHeliGlass)" stroke="#d9fff6" strokeWidth="2"/>
                <path d="M92 77 L128 77 Q124 90 108 91 L88 88Z" fill="#075d54" opacity=".8"/>
                <path d="M60 93 L56 100 M115 94 L119 100 M49 101 L126 101" stroke="#b8ffe9" strokeWidth="4" strokeLinecap="round"/>
                <path d="M84 40 L94 29 L101 40" fill="none" stroke="#79f4d2" strokeWidth="3"/>
                <circle cx="138" cy="69" r="3" fill="#ffe58b"/><circle cx="138" cy="69" r="7" fill="#ffe58b" opacity=".22"/>
                <path d="M52 58 Q67 45 82 49" fill="none" stroke="#ffffff" strokeWidth="2" opacity=".5"/>
              </svg>
            </div>
            {crashExploding&&<div className="crash-explosion" style={{left:`var(--crash-heli-left,72%)`,top:`var(--crash-heli-top,21%)`}} aria-label={arabic?'انفجار المروحية':'Helicopter explosion'}><span>✦</span><b>BOOM</b></div>}
            {crashCountdown!==null&&<div className="crash-countdown"><small>{arabic?'الجولة التالية تبدأ خلال':'NEXT ROUND IN'}</small><strong>{crashCountdown}</strong><small>{arabic?'ثوانٍ':'SECONDS'}</small></div>}
            <div className="crash-stage-hud"><span>{arabic?'الرحلة المباشرة':'LIVE FLIGHT'}</span><b>{multiplier.toFixed(2)}×</b></div>
            <div className="crash-stage-bottom"><span>BETNOVA AIR</span><span>{crashActive?(arabic?'في الجو':'IN FLIGHT'):multiplier>1?(arabic?'انتهت الجولة':'ROUND ENDED'):(arabic?'جاهز للإقلاع':'READY FOR TAKEOFF')}</span></div>
          </div>
          <div className={`crash-multiplier ${crashActive?'rising':''}`} aria-live="polite">{multiplier.toFixed(2)}<small>×</small></div>
          {!crashActive&&!crashExploding&&crashCountdown===null?<button className="game-detail-done" type="button" onClick={startCrash}><Play size={15}/> {labels.start}</button>:crashActive?<div className="game-action-row"><button type="button" onClick={cashOutCrash}>{labels.stop}</button></div>:<div className="game-detail-done crash-auto-status">{crashExploding?(arabic?'جاري الانفجار...':'CRASH EFFECT...'):(arabic?'استعد للجولة التالية':'NEXT ROUND COUNTDOWN')}</div>}
        </div>}
        {selected.id==='apple'&&<div className="game-practice-controls">
          <div className="apple-board" aria-label={arabic?'خمسة صفوف من التفاحات، اختر تفاحة آمنة في كل صف':'Five rows of apples, choose one safe apple in each row'}>{Array.from({length:APPLE_ROWS},(_,row)=><div className="apple-row" key={row}>{Array.from({length:APPLE_COLUMNS},(_,col)=>{const chosen=applePicks[row]===col;const revealed=row<appleLevel||(appleDone&&row===appleLevel);const trap=appleTraps[row]===col;return <button key={col} type="button" disabled={appleDone||row!==appleLevel} className={`${chosen?'chosen ':''}${revealed&&trap?'trap ':''}${revealed&&chosen&&!trap?'safe ':''}${row>appleLevel?'locked':''}`} onClick={()=>pickApple(col)} aria-label={`${arabic?'الصف':'Row'} ${row+1}, ${arabic?'التفاحة':'apple'} ${col+1}`}>{revealed?(trap?'💣':chosen?'🍏':'🍎'):'🍏'}</button>})}</div>)}</div>
        </div>}
        {selected.id==='plinko'&&<div className="game-practice-controls">
          <div className="plinko-board"><span className={plinkoDropping?'plinko-ball dropping':'plinko-ball'} aria-hidden="true">●</span><div className="plinko-pegs">{Array.from({length:6},(_,row)=><div className="plinko-peg-row" key={row}>{Array.from({length:row+3},(_,col)=><i key={col}/>)}</div>)}</div><div className="plinko-slots">{Array.from({length:9},(_,i)=><span key={i} className={plinkoSlot===i+1?'landed':''}>{plinkoSlot===i+1?'●':i+1}</span>)}</div></div>
          <button className="game-detail-done" type="button" onClick={dropPlinko} disabled={plinkoDropping}><Play size={15}/> {plinkoDropping?(arabic?'الكرة تهبط...':'BALL DROPPING...'):labels.drop}</button>
        </div>}
        {['lucky-fruits','pharaoh','space-spin'].includes(selected.id)&&<div className="game-practice-controls"><div className="slot-reels" aria-label="Practice slot reels">{slotSymbols.map((symbol,i)=><span className={slotSpinning?'spinning':''} key={i}>{symbol}</span>)}</div><button className="game-detail-done" type="button" onClick={spinSlots} disabled={slotSpinning}><RotateCw size={15}/> {slotSpinning?(arabic?'تدور البكرات...':'SPINNING...'):labels.tryDemo}</button></div>}
        {selected.id==='roulette'&&<div className="game-practice-controls"><div className="roulette-preview"><div className={`roulette-wheel ${rouletteSpinning?'spinning':''}`}><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><b>{rouletteNumber===null?'?':rouletteNumber}</b></div><small>{rouletteSpinning?(arabic?'العجلة تدور...':'WHEEL SPINNING'):rouletteNumber===null?'READY TO SPIN':rouletteNumber===0?(arabic?'صفر أخضر':'GREEN ZERO'):rouletteReds.has(rouletteNumber)?(arabic?'نتيجة حمراء':'RED RESULT'):(arabic?'نتيجة سوداء':'BLACK RESULT')}</small></div><button className="game-detail-done" type="button" onClick={spinRoulette} disabled={rouletteSpinning}><RotateCw size={15}/> {rouletteSpinning?(arabic?'تدور العجلة...':'SPINNING...'):labels.tryDemo}</button></div>}
        {selected.id==='blackjack'&&<div className="game-practice-controls"><div className="practice-playing-cards">{(cardHand.length?cardHand:['?','?']).map((card,i)=><span key={i}>{typeof card==='number'?cardLabel(card):card}</span>)}</div><div className="blackjack-controls"><span>{arabic?'مجموعك':'YOUR TOTAL'}: {blackjackTotal(cardHand)}</span>{dealerHand.length>0&&<span>{arabic?'الموزع':'DEALER'}: {blackjackDone?blackjackTotal(dealerHand):cardLabel(dealerHand[0])+' + ?'}</span>}</div><div className="game-action-row"><button type="button" onClick={blackjackHit} disabled={blackjackDone||cardHand.length===0}>{arabic?'اسحب':'HIT'}</button><button type="button" onClick={blackjackStand} disabled={blackjackDone||cardHand.length===0}>{arabic?'قف':'STAND'}</button><button type="button" onClick={runOtherDemo}>{arabic?'جولة جديدة':'NEW HAND'}</button></div></div>}
        {selected.id==='baccarat'&&<div className="game-practice-controls"><div className="baccarat-preview"><div><small>{arabic?'اللاعب':'PLAYER'}</small><strong>{baccaratHand?`${baccaratHand.player.map(cardLabel).join(' · ')} = ${baccaratTotal(baccaratHand.player)}`:'—'}</strong></div><div><small>{arabic?'المصرف':'BANKER'}</small><strong>{baccaratHand?`${baccaratHand.banker.map(cardLabel).join(' · ')} = ${baccaratTotal(baccaratHand.banker)}`:'—'}</strong></div></div><button className="game-detail-done" type="button" onClick={runOtherDemo}><RotateCw size={15}/> {labels.tryDemo}</button></div>}
        {practiceResult&&<div className="game-practice-result" role="status"><strong>{arabic?`الجولة ${practiceCount}`:practiceCount===0?'PRACTICE UPDATE':`ROUND ${practiceCount}`}</strong><span>{practiceResult}</span></div>}
        <button className="game-detail-secondary" type="button" onClick={resetDemo}>{labels.reset}</button>
        <button className="game-detail-secondary" type="button" onClick={closeGame}>{labels.close}</button>
      </section>
    </div>}
  </section>
}
