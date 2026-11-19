import { useState, type CSSProperties } from 'react'
import { useLanguage } from '../i18n'
import { ArrowRight, Crown, Gem, Grid3X3, Play, Sparkles, X, Zap, RotateCw } from 'lucide-react'

type Category = 'all' | 'games' | 'slots' | 'casino'
type Game = { id:string; name:string; category:Exclude<Category,'all'>; tag:string; description:string; art:string; accent:string; mark:string }

const games:Game[] = [
  {id:'crash',name:'CRASH',category:'games',tag:'INSTANT GAME',description:'Start a free round, watch the practice multiplier rise and choose when to stop.',art:'rocket',accent:'coral',mark:'🚀'},
  {id:'apple',name:'APPLE OF FORTUNE',category:'games',tag:'SKILL & LUCK',description:'Pick safe apples across three practice levels. This demo uses no money or real game outcomes.',art:'apple',accent:'lime',mark:'🍏'},
  {id:'plinko',name:'PLINKO',category:'games',tag:'INSTANT GAME',description:'Drop a practice ball through a pin field and reveal its landing slot.',art:'plinko',accent:'cyan',mark:'🔮'},
  {id:'lucky-fruits',name:'LUCKY FRUITS',category:'slots',tag:'CLASSIC SLOTS',description:'A bright fruit-machine theme with polished reels, rich symbols and a modern arcade finish.',art:'fruits',accent:'pink',mark:'🍒'},
  {id:'pharaoh',name:"PHARAOH'S GOLD",category:'slots',tag:'ADVENTURE SLOTS',description:'An elegant ancient-Egypt inspired slot concept with gold, lapis tones and royal symbols.',art:'pharaoh',accent:'gold',mark:'𓂀'},
  {id:'space-spin',name:'SPACE SPIN',category:'slots',tag:'COSMIC SLOTS',description:'A futuristic slot concept with planets, glowing stars and a deep-space atmosphere.',art:'space',accent:'violet',mark:'🪐'},
  {id:'roulette',name:'EUROPEAN ROULETTE',category:'casino',tag:'TABLE CLASSIC',description:'A refined single-zero roulette table concept with a clean, readable layout.',art:'roulette',accent:'green',mark:'🎡'},
  {id:'blackjack',name:'BLACKJACK',category:'casino',tag:'CARD TABLE',description:'A classic 21 card-table concept with premium felt, clear cards and a calm table design.',art:'cards',accent:'blue',mark:'♠'},
  {id:'baccarat',name:'BACCARAT',category:'casino',tag:'CARD TABLE',description:'A sophisticated Player-versus-Banker table concept with a minimal casino presentation.',art:'baccarat',accent:'gold',mark:'♦'},
]

const categoryIcons:Record<Category,typeof Grid3X3>={all:Grid3X3,games:Zap,slots:Gem,casino:Crown}
const arabicDescriptions:Record<string,string>={crash:'ابدأ جولة تدريبية مجانية، راقب المضاعف واختر وقت التوقف.',apple:'اختر التفاحات الآمنة عبر ثلاثة مستويات تدريبية دون أموال أو نتائج حقيقية.',plinko:'أسقط كرة تدريبية عبر المسامير وشاهد خانة الهبوط.', 'lucky-fruits':'تصميم فواكه كلاسيكي بألوان زاهية وبكرات عصرية.',pharaoh:'أجواء مصرية قديمة أنيقة مع الذهب والرموز الملكية.','space-spin':'تصميم فضائي مستقبلي بالكواكب والنجوم والألوان المتوهجة.',roulette:'تصميم أنيق لعجلة روليت أوروبية ذات صفر واحد.',blackjack:'تصميم لطاولة بلاك جاك بأوراق واضحة وأجواء راقية.',baccarat:'تصميم أنيق لطاولة باكارات بين اللاعب والمصرف.'}
const choose=<T,>(items:T[])=>items[Math.floor(Math.random()*items.length)]

export default function GamesHub(){
  const {language}=useLanguage()
  const arabic=language==='ar'
  const labels=arabic?{all:'كل الألعاب',games:'الألعاب',slots:'السلوتس',casino:'الكازينو',heading:'ادخل إلى',zone:'منطقة اللعب',subtitle:'اكتشف بُعداً جديداً من الترفيه.',explore:'استكشف اللعبة',safety:'تجارب تدريبية مجانية فقط. لا توجد إيداعات أو رهانات أو سحوبات أو جوائز أو أموال حقيقية.',practice:'تجربة مجانية',demo:'وضع تجريبي · بدون أموال أو رهانات',start:'ابدأ جولة تدريبية',next:'الخطوة التالية +0.25×',stop:'توقف الآن',pick:'اختر التفاحة التالية',drop:'أسقط الكرة',tryDemo:'جرّب العرض المجاني',reset:'إعادة التجربة',close:'إغلاق'}:{all:'ALL GAMES',games:'GAMES',slots:'SLOTS',casino:'CASINO',heading:'ENTER THE',zone:'PLAY ZONE',subtitle:'Discover a new dimension of play.',explore:'EXPLORE GAME',safety:'Free practice demonstrations only. No deposits, wagers, cash-out value, prizes or real-money play are enabled.',practice:'FREE PRACTICE',demo:'DEMO MODE · NO MONEY OR BETS',start:'START PRACTICE ROUND',next:'NEXT STEP +0.25×',stop:'STOP HERE',pick:'PICK NEXT APPLE',drop:'DROP PRACTICE BALL',tryDemo:'TRY FREE DEMO',reset:'RESET PRACTICE',close:'CLOSE'}
  const [category,setCategory]=useState<Category>('all')
  const [selected,setSelected]=useState<Game|null>(null)
  const [practiceResult,setPracticeResult]=useState('')
  const [practiceCount,setPracticeCount]=useState(0)
  const [crashAt,setCrashAt]=useState(0)
  const [multiplier,setMultiplier]=useState(1)
  const [crashActive,setCrashActive]=useState(false)
  const [appleLevel,setAppleLevel]=useState(0)
  const [appleDone,setAppleDone]=useState(false)
  const [plinkoSlot,setPlinkoSlot]=useState<number|null>(null)
  const visible=games.filter(game=>category==='all'||game.category===category)
  const resetDemo=()=>{
    setPracticeResult('');setPracticeCount(0);setCrashAt(0);setMultiplier(1)
    setCrashActive(false);setAppleLevel(0);setAppleDone(false);setPlinkoSlot(null)
  }
  const closeGame=()=>{setSelected(null);resetDemo()}
  const startCrash=()=>{
    setCrashAt(1.25+Math.random()*4.75);setMultiplier(1);setCrashActive(true)
    setPracticeResult('Multiplier is live. Advance carefully or cash out in this practice demo.')
    setPracticeCount(value=>value+1)
  }
  const advanceCrash=()=>{
    if(!crashActive)return
    const next=Number((multiplier+0.25).toFixed(2))
    if(next>=crashAt){
      setMultiplier(next);setCrashActive(false)
      setPracticeResult(`Practice crash at ${next.toFixed(2)}×. Round ended with no payout or balance change.`)
    }else setMultiplier(next)
  }
  const cashOutCrash=()=>{
    if(!crashActive)return
    setCrashActive(false)
    setPracticeResult(`Practice cash-out at ${multiplier.toFixed(2)}×. This is a display-only result; no winnings were created.`)
  }
  const pickApple=()=>{
    if(appleDone)return
    if(Math.random()<0.27){
      setAppleDone(true);setPracticeResult(`Trap revealed at level ${appleLevel+1}. Start a fresh practice round to try again.`)
    }else{
      const next=appleLevel+1;setAppleLevel(next)
      if(next>=3){setAppleDone(true);setPracticeResult('Three safe picks! Practice level completed. No prize or balance was awarded.')}
      else setPracticeResult(`Safe apple! Level ${next} of 3 completed. Continue or finish this practice round.`)
    }
    setPracticeCount(value=>value+1)
  }
  const dropPlinko=()=>{
    const slot=Math.floor(Math.random()*9)+1
    setPlinkoSlot(slot);setPracticeCount(value=>value+1)
    setPracticeResult(`The practice ball landed in slot ${slot} of 9. No prize or balance was awarded.`)
  }
  const runOtherDemo=()=>{
    if(!selected)return
    let result=''
    switch(selected.id){
      case 'lucky-fruits':
      case 'pharaoh':
      case 'space-spin': result=`Practice spin: ${choose(['🍒  ⭐  🍋','💎  💎  🍀','𓂀  👑  ✨','🪐  🌟  💫','🍋  🍒  🍒'])}. Demo symbols only.`;break
      case 'roulette': {const n=Math.floor(Math.random()*37);result=`Practice wheel: ${n} · ${n===0?'GREEN':n%2?'RED':'BLACK'}. No real roulette result.`;break}
      case 'blackjack': {const a=Math.floor(Math.random()*10)+2,b=Math.floor(Math.random()*10)+2;result=`Practice hand: ${a} + ${b} = ${a+b}. Simplified preview, not a full blackjack round.`;break}
      case 'baccarat': {const p=Math.floor(Math.random()*10),b=Math.floor(Math.random()*10);result=`Practice deal · Player: ${p} · Banker: ${b}. Simplified preview only.`;break}
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
      <section className={`game-detail-modal game-${selected.accent}`} role="dialog" aria-modal="true" aria-labelledby="game-detail-title">
        <button className="game-detail-close" type="button" onClick={closeGame} aria-label="Close"><X size={18}/></button>
        <div className={`game-detail-art art-${selected.art}`}><span>{selected.mark}</span><i/><b>BETNOVA</b></div>
        <div className="games-kicker"><Sparkles size={14}/> {labels.practice} · {selected.tag}</div><h3 id="game-detail-title">{selected.name}</h3><p>{arabic?(arabicDescriptions[selected.id]??selected.description):selected.description}</p>
        <div className="game-coming-soon"><Play size={15}/> {labels.demo}</div>
        {selected.id==='crash'&&<div className="game-practice-controls">
          <div className="crash-multiplier">{multiplier.toFixed(2)}<small>×</small></div>
          {!crashActive?<button className="game-detail-done" type="button" onClick={startCrash}><Play size={15}/> {labels.start}</button>:<div className="game-action-row"><button type="button" onClick={advanceCrash}>{labels.next}</button><button type="button" onClick={cashOutCrash}>{labels.stop}</button></div>}
        </div>}
        {selected.id==='apple'&&<div className="game-practice-controls">
          <div className="apple-levels">{[0,1,2].map(i=><span key={i} className={i<appleLevel?'safe':''}>{i<appleLevel?'✓':'🍏'}</span>)}</div>
          <button className="game-detail-done" type="button" disabled={appleDone} onClick={pickApple}>{labels.pick} · LEVEL {Math.min(appleLevel+1,3)}</button>
        </div>}
        {selected.id==='plinko'&&<div className="game-practice-controls">
          <div className="plinko-slots">{Array.from({length:9},(_,i)=><span key={i} className={plinkoSlot===i+1?'landed':''}>{plinkoSlot===i+1?'●':i+1}</span>)}</div>
          <button className="game-detail-done" type="button" onClick={dropPlinko}><Play size={15}/> {labels.drop}</button>
        </div>}
        {!['crash','apple','plinko'].includes(selected.id)&&<button className="game-detail-done" type="button" onClick={runOtherDemo}><RotateCw size={15}/> {labels.tryDemo}</button>}
        {practiceResult&&<div className="game-practice-result" role="status"><strong>{practiceCount===0?'PRACTICE UPDATE':`ROUND ${practiceCount}`}</strong><span>{practiceResult}</span></div>}
        <button className="game-detail-secondary" type="button" onClick={resetDemo}>{labels.reset}</button>
        <button className="game-detail-secondary" type="button" onClick={closeGame}>{labels.close}</button>
      </section>
    </div>}
  </section>
}
