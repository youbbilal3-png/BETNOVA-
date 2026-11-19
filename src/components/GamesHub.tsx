import { useState, type CSSProperties } from 'react'
import { ArrowRight, Crown, Gem, Grid3X3, Play, Sparkles, Spade, X, Zap, RotateCw } from 'lucide-react'

type Category = 'all' | 'games' | 'slots' | 'casino'
type Game = { id:string; name:string; category:Exclude<Category,'all'>; tag:string; description:string; art:string; accent:string; mark:string }

const games:Game[] = [
  {id:'crash',name:'CRASH',category:'games',tag:'INSTANT GAME',description:'Watch the multiplier climb and decide when to cash out. Try a short, free interface demo.',art:'rocket',accent:'coral',mark:'🚀'},
  {id:'apple',name:'APPLE OF FORTUNE',category:'games',tag:'SKILL & LUCK',description:'Choose an apple and reveal a practice result. This demo does not use money or real game outcomes.',art:'apple',accent:'lime',mark:'🍏'},
  {id:'plinko',name:'PLINKO',category:'games',tag:'INSTANT GAME',description:'Drop a practice ball through the pins and reveal its landing slot.',art:'plinko',accent:'cyan',mark:'🔮'},
  {id:'lucky-fruits',name:'LUCKY FRUITS',category:'slots',tag:'CLASSIC SLOTS',description:'A bright fruit-machine theme with polished reels, rich symbols and a modern arcade finish.',art:'fruits',accent:'pink',mark:'🍒'},
  {id:'pharaoh',name:"PHARAOH'S GOLD",category:'slots',tag:'ADVENTURE SLOTS',description:'An elegant ancient-Egypt inspired slot concept with gold, lapis tones and royal symbols.',art:'pharaoh',accent:'gold',mark:'𓂀'},
  {id:'space-spin',name:'SPACE SPIN',category:'slots',tag:'COSMIC SLOTS',description:'A futuristic slot concept with planets, glowing stars and a deep-space atmosphere.',art:'space',accent:'violet',mark:'🪐'},
  {id:'roulette',name:'EUROPEAN ROULETTE',category:'casino',tag:'TABLE CLASSIC',description:'A refined single-zero roulette table concept with a clean, readable layout.',art:'roulette',accent:'green',mark:'🎡'},
  {id:'blackjack',name:'BLACKJACK',category:'casino',tag:'CARD TABLE',description:'A classic 21 card-table concept with premium felt, clear cards and a calm table design.',art:'cards',accent:'blue',mark:'♠'},
  {id:'baccarat',name:'BACCARAT',category:'casino',tag:'CARD TABLE',description:'A sophisticated Player-versus-Banker table concept with a minimal casino presentation.',art:'baccarat',accent:'gold',mark:'♦'},
]

const categoryLabels:Record<Category,string>={all:'ALL GAMES',games:'GAMES',slots:'SLOTS',casino:'CASINO'}
const categoryIcons:Record<Category,typeof Grid3X3>={all:Grid3X3,games:Zap,slots:Gem,casino:Crown}
const choose=<T,>(items:T[])=>items[Math.floor(Math.random()*items.length)]

function runPractice(game:Game){
  switch(game.id){
    case 'crash': { const point=(1+Math.random()*7).toFixed(2); return `Practice round ended at ${point}×. No cash-out or balance was involved.` }
    case 'apple': return Math.random()>.28?'Safe apple revealed! Choose again in a new practice round.':'This pick was a trap in the practice demo. Start a new round.'
    case 'plinko': return `Ball landed in slot ${Math.floor(Math.random()*9)+1} of 9. Practice result only.`
    case 'lucky-fruits':
    case 'pharaoh':
    case 'space-spin': return `Practice spin: ${choose(['🍒  ⭐  🍋','💎  💎  🍀','𓂀  👑  ✨','🪐  🌟  💫','🍋  🍒  🍒'])}. Demo symbols only.`
    case 'roulette': { const n=Math.floor(Math.random()*37); return `Practice wheel: ${n} · ${n===0?'GREEN':n%2?'RED':'BLACK'}. No real roulette result.` }
    case 'blackjack': { const a=Math.floor(Math.random()*10)+2,b=Math.floor(Math.random()*10)+2; return `Practice hand: ${a} + ${b} = ${a+b}. This is a simplified preview, not a full blackjack round.` }
    case 'baccarat': { const p=Math.floor(Math.random()*10),b=Math.floor(Math.random()*10); return `Practice deal · Player: ${p} · Banker: ${b}. Simplified preview only.` }
    default: return 'Practice preview completed.'
  }
}

export default function GamesHub(){
  const [category,setCategory]=useState<Category>('all')
  const [selected,setSelected]=useState<Game|null>(null)
  const [practiceResult,setPracticeResult]=useState('')
  const [practiceCount,setPracticeCount]=useState(0)
  const visible=games.filter(game=>category==='all'||game.category===category)
  const closeGame=()=>{setSelected(null);setPracticeResult('');setPracticeCount(0)}
  return <section className="games-hub" id="games">
    <div className="games-hub-head">
      <div><div className="games-kicker"><Sparkles size={14}/> BETNOVA ARCADE</div><h2>ENTER THE <em>PLAY ZONE</em></h2><p>Discover a new dimension of play.</p></div>
      <div className="games-head-orb" aria-hidden="true"><span>BN</span></div>
    </div>
    <div className="games-category-tabs" role="tablist" aria-label="Game categories">
      {(['all','games','slots','casino'] as Category[]).map(key=>{const Icon=categoryIcons[key];return <button key={key} type="button" role="tab" aria-selected={category===key} className={category===key?'active':''} onClick={()=>setCategory(key)}><Icon size={15}/>{categoryLabels[key]}<span>{key==='all'?games.length:games.filter(game=>game.category===key).length}</span></button>})}
    </div>
    <div className="games-grid">
      {visible.map((game,index)=><article className={`game-tile game-${game.accent}`} key={game.id} style={{'--game-index':index} as CSSProperties}>
        <div className={`game-art art-${game.art}`} aria-hidden="true">
          <div className="game-art-glow"/>
          <div className="game-art-object">{game.mark}</div>
          <span className="game-art-orbit orbit-one"/><span className="game-art-orbit orbit-two"/>
          <span className="game-art-shine">✦</span><span className="game-art-code">BETNOVA / PLAY</span>
        </div>
        <div className="game-tile-copy"><div className="game-tile-meta"><span>{game.tag}</span><span className="game-live-dot"/></div><h3>{game.name}</h3><p>{game.description}</p><button type="button" onClick={()=>{setSelected(game);setPracticeResult('');setPracticeCount(0)}}>EXPLORE GAME <ArrowRight size={14}/></button></div>
      </article>)}
    </div>
    <div className="games-safety-note"><Sparkles size={15}/><span>Free interface demonstrations only. No deposits, wagers, cash-out, prizes or real-money play are enabled.</span></div>
    {selected&&<div className="game-detail-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)closeGame()}}>
      <section className={`game-detail-modal game-${selected.accent}`} role="dialog" aria-modal="true" aria-labelledby="game-detail-title">
        <button className="game-detail-close" type="button" onClick={closeGame} aria-label="Close"><X size={18}/></button>
        <div className={`game-detail-art art-${selected.art}`}><span>{selected.mark}</span><i/><b>BETNOVA</b></div>
        <div className="games-kicker"><Sparkles size={14}/> FREE PRACTICE · {selected.tag}</div><h3 id="game-detail-title">{selected.name}</h3><p>{selected.description}</p>
        <div className="game-coming-soon"><Play size={15}/> DEMO MODE · NO MONEY OR BETS</div>
        {practiceResult&&<div className="game-practice-result" role="status"><strong>ROUND {practiceCount}</strong><span>{practiceResult}</span></div>}
        <button className="game-detail-done" type="button" onClick={()=>{setPracticeResult(runPractice(selected));setPracticeCount(value=>value+1)}}><RotateCw size={15}/> TRY FREE DEMO</button>
        <button className="game-detail-secondary" type="button" onClick={closeGame}>CLOSE</button>
      </section>
    </div>}
  </section>
}
