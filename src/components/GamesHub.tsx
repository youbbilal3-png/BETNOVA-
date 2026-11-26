import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLanguage } from '../i18n'
import '../games-hub.css'
import { ArrowRight, Crown, Gem, Grid3X3, Play, Sparkles, X, Zap, RotateCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Category = 'all' | 'games' | 'slots' | 'casino'
type Game = { id:string; name:string; category:Exclude<Category,'all'>; tag:string; description:string; art:string; accent:string; mark:string }

const games:Game[] = [
  {id:'crash',name:'CRASH',category:'games',tag:'INSTANT GAME',description:'Start a free round, watch the practice multiplier rise and choose when to stop.',art:'rocket',accent:'coral',mark:'🚀'},
  {id:'apple',name:'APPLE OF FORTUNE',category:'games',tag:'SKILL & LUCK',description:'Pick one safe apple in each of five rows while avoiding the hidden trap. Free practice only.',art:'apple',accent:'lime',mark:'🍏'},
  {id:'plinko',name:'PLINKO',category:'games',tag:'INSTANT GAME',description:'Drop a practice ball through a pin field and reveal its landing slot.',art:'plinko',accent:'cyan',mark:'🔮'},
  {id:'lucky-fruits',name:'LUCKY FRUITS',category:'slots',tag:'CLASSIC SLOTS',description:'A bright fruit-machine theme with polished reels, rich symbols and a modern arcade finish.',art:'fruits',accent:'pink',mark:'🍒'},
  {id:'pharaoh',name:"PHARAOH'S GOLD",category:'slots',tag:'ADVENTURE SLOTS',description:'An elegant ancient-Egypt inspired slot concept with gold, lapis tones and royal symbols.',art:'pharaoh',accent:'gold',mark:'𓂀'},
  {id:'space-spin',name:'SPACE SPIN',category:'slots',tag:'COSMIC SLOTS',description:'A futuristic slot concept with planets, glowing stars and a deep-space atmosphere.',art:'space',accent:'violet',mark:'🪐'},
  {id:'coyote-jackpot',name:'COYOTE JACKPOT',category:'slots',tag:'3×3 SLOT',description:'A three-row, three-column coyote-themed slot preview. Practice mode only.',art:'coyote',accent:'gold',mark:'🐺'},
  {id:'roulette',name:'EUROPEAN ROULETTE',category:'casino',tag:'TABLE CLASSIC',description:'A refined single-zero roulette table concept with a clean, readable layout.',art:'roulette',accent:'green',mark:'🎡'},
  {id:'blackjack',name:'BLACKJACK',category:'casino',tag:'CARD TABLE',description:'A classic 21 card-table concept with premium felt, clear cards and a calm table design.',art:'cards',accent:'blue',mark:'♠'},
  {id:'baccarat',name:'BACCARAT',category:'casino',tag:'CARD TABLE',description:'A sophisticated Player-versus-Banker table concept with a minimal casino presentation.',art:'baccarat',accent:'gold',mark:'♦'},
]

const categoryIcons:Record<Category,typeof Grid3X3>={all:Grid3X3,games:Zap,slots:Gem,casino:Crown}
const choose=<T,>(items:T[])=>items[Math.floor(Math.random()*items.length)]
const APPLE_ROWS=5, APPLE_COLUMNS=5
const newAppleTraps=()=>Array.from({length:APPLE_ROWS},()=>Math.floor(Math.random()*APPLE_COLUMNS))
const rouletteReds=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
const drawCard=()=>{const value=Math.floor(Math.random()*13)+1;return value===1?11:Math.min(value,10)}
const cardLabel=(value:number)=>value===11?'A':String(value)
const baccaratValue=(value:number)=>value===11?1:value>=10?0:value
const baccaratTotal=(hand:number[])=>hand.reduce((sum,value)=>sum+baccaratValue(value),0)%10

export default function GamesHub({initialGameRequest}:{initialGameRequest?:{id:string;token:number}|null}){
  const {language,t}=useLanguage()
  const arabic=language==='ar'
  const translatedGameTag=(id:string)=>{switch(id){case 'crash':case 'plinko':return t('game_tag_instant');case 'apple':return t('game_tag_skill');case 'lucky-fruits':return t('game_tag_classic');case 'pharaoh':return t('game_tag_adventure');case 'space-spin':return t('game_tag_cosmic');case 'roulette':return t('game_tag_table');case 'blackjack':case 'baccarat':return t('game_tag_cards');default:return id}}
  const translatedGameDescription=(id:string)=>{switch(id){case 'crash':return arabic?'أدخل مبلغ الرهان وابدأ اللعبة. اسحب أرباحك قبل انفجار الطائرة.':'Enter your stake and start. Cash out before the plane crashes.';case 'apple':return t('game_desc_apple');case 'plinko':return t('game_desc_plinko');case 'lucky-fruits':return t('game_desc_fruits');case 'pharaoh':return t('game_desc_pharaoh');case 'space-spin':return t('game_desc_space');case 'coyote-jackpot':return arabic?'آلة حظ بثلاثة صفوف وثلاثة أعمدة. وضع تجريبي فقط.':'A three-row, three-column slot preview. Practice only.';case 'roulette':return t('game_desc_roulette');case 'blackjack':return t('game_desc_blackjack');case 'baccarat':return t('game_desc_baccarat');default:return ''}}
  const labels={all:t('all_games'),games:t('games'),slots:t('slots'),casino:t('casino'),heading:t('arcade_heading'),zone:t('game_zone'),subtitle:t('arcade_subtitle'),explore:t('explore_game'),safety:t('arcade_safety'),practice:t('free_practice'),demo:t('demo_mode'),start:t('start_practice'),next:t('next_step'),stop:t('stop_now'),pick:t('pick_apple'),drop:t('drop_ball'),tryDemo:t('try_demo'),reset:t('reset_practice'),close:t('close')}
  const [category,setCategory]=useState<Category>('all')
  const [selected,setSelected]=useState<Game|null>(null)
  const [practiceResult,setPracticeResult]=useState('')
  const [practiceCount,setPracticeCount]=useState(0)
  const [crashAt,setCrashAt]=useState(0)
  const [multiplier,setMultiplier]=useState(1)
  const [crashRate,setCrashRate]=useState(0.06)
  const [crashActive,setCrashActive]=useState(false)
  const [crashExploding,setCrashExploding]=useState(false)
  const [crashCountdown,setCrashCountdown]=useState<number|null>(null)
  const [appleLevel,setAppleLevel]=useState(0)
  const [appleDone,setAppleDone]=useState(false)
  const [appleTraps,setAppleTraps]=useState<number[]>(()=>newAppleTraps())
  const [applePicks,setApplePicks]=useState<number[]>([])
  const [realAppleRound,setRealAppleRound]=useState<{id:string;stake:number;currentRow:number;multiplier:number}|null>(null)
  const [applePickKey,setApplePickKey]=useState(()=>crypto.randomUUID())
  const [appleCashoutKey,setAppleCashoutKey]=useState<string|null>(null)
  const [plinkoSlot,setPlinkoSlot]=useState<number|null>(null)
  const [plinkoDropping,setPlinkoDropping]=useState(false)
  const [slotSymbols,setSlotSymbols]=useState<string[]>(Array(9).fill('🍒'))
  const [slotSpinning,setSlotSpinning]=useState(false)
  const slotTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const modalRef=useRef<HTMLElement|null>(null)
  const [rouletteNumber,setRouletteNumber]=useState<number|null>(null)
  const [rouletteSpinning,setRouletteSpinning]=useState(false)
  const [cardHand,setCardHand]=useState<number[]>([])
  const [dealerHand,setDealerHand]=useState<number[]>([])
  const [blackjackDone,setBlackjackDone]=useState(false)
  const [baccaratHand,setBaccaratHand]=useState<{player:number[];banker:number[]}|null>(null)
  const [realStake,setRealStake]=useState('100')
  const [realChoice,setRealChoice]=useState('standard')
  const [realBalance,setRealBalance]=useState<number|null>(null)
  const [realBetBusy,setRealBetBusy]=useState(false)
  const [realBetMessage,setRealBetMessage]=useState('')
  const [realBetResult,setRealBetResult]=useState<Record<string,unknown>|null>(null)
  const [realRoundKey,setRealRoundKey]=useState(()=>crypto.randomUUID())
  const [realCrashRound,setRealCrashRound]=useState<{id:string;stake:number;startedAt:number;clientAnchor:number;elapsedBase:number}|null>(null)
  const [realCrashCashoutKey,setRealCrashCashoutKey]=useState<string|null>(null)
  const visible=games.filter(game=>category==='all'||game.category===category)
  const slotSymbolsFor=(id?:string)=>Array.from({length:9},(_,i)=>id==='pharaoh'?['𓂀','👑','⚱️'][i%3]:id==='space-spin'?['🪐','🌟','🚀'][i%3]:id==='coyote-jackpot'?['🐺','💎','7️⃣'][i%3]:['🍒','⭐','🍋'][i%3])
  const resetDemo=(gameId=selected?.id)=>{
    if(slotTimer.current)clearTimeout(slotTimer.current);slotTimer.current=null;setSlotSpinning(false)
    setPracticeResult('');setPracticeCount(0);setCrashAt(0);setMultiplier(1)
    if(!realCrashRound){setCrashActive(false);setCrashExploding(false);setCrashCountdown(null)}setAppleLevel(0);setAppleDone(false);setAppleTraps(newAppleTraps());setApplePicks([]);setPlinkoSlot(null);setPlinkoDropping(false)
    setSlotSymbols(slotSymbolsFor(gameId));setRouletteNumber(null);setRouletteSpinning(false);setCardHand([]);setDealerHand([]);setBlackjackDone(false);setBaccaratHand(null)
  }
  useEffect(()=>{if(!initialGameRequest)return;const target=games.find(game=>game.id===initialGameRequest.id);if(target){setCategory('games');setSelected(target);resetDemo(target.id)}},[initialGameRequest])
  useEffect(()=>{
    if(!selected)return
    setRealBetResult(null);setRealBetMessage('');setRealBalance(null);setRealAppleRound(null)
    setRealChoice(selected.id==='crash'?'2.00':selected.id==='apple'?'1':selected.id==='plinko'?'medium':selected.id==='roulette'?'red':selected.id==='baccarat'?'player':selected.id==='blackjack'?'stand':'standard')
    const client=supabase
    if(!client){setRealBetMessage(arabic?'خدمة الرهان غير متاحة حالياً.':'Betting service is unavailable.');return}
    let active=true
    client.auth.getUser().then(async({data,error})=>{
      if(error)throw error
      if(!data.user){if(active){setRealBalance(null);setRealBetMessage(arabic?'سجّل الدخول أولاً للمراهنة.':'Sign in to place a real-money bet.')}return}
      const {data:wallet,error:walletError}=await client.from('wallet_accounts').select('available_balance').eq('user_id',data.user.id).eq('currency','DZD').maybeSingle()
      if(walletError)throw walletError
      if(active)setRealBalance(Number(wallet?.available_balance??0))
      if(active&&selected.id==='apple'){
        const {data:round,error:roundError}=await client.from('game_rounds').select('id,stake,outcome,status').eq('user_id',data.user.id).eq('game_id','apple').eq('status','active').order('started_at',{ascending:false}).limit(1).maybeSingle()
        if(roundError)throw roundError
        if(round){const state=round.outcome as Record<string,unknown>;const currentRow=Number(state?.current_row??0);const multiplier=Number(state?.multiplier??0);setRealAppleRound({id:String(round.id),stake:Number(round.stake),currentRow,multiplier});setAppleLevel(currentRow);setAppleDone(false)}}
    }).catch(error=>{if(active)setRealBetMessage(error instanceof Error?error.message:'Could not load wallet balance.')})
    return()=>{active=false}
  },[selected?.id,arabic])
  useEffect(()=>{
    const client=supabase
    if(selected?.id!=='crash'||!realCrashRound||!client||realBetBusy)return
    let active=true
    let pending=false
    const poll=async()=>{
      if(pending)return
      pending=true
      try{
        const {data,error}=await client.rpc('betnova_resume_crash_round')
        if(error)throw error
        if(!active||!data)return
        const result=(typeof data==='string'?JSON.parse(data):data) as Record<string,unknown>
        if(result.status==='crashed'){
          setRealCrashRound(null);setCrashActive(false);setCrashExploding(true)
          setMultiplier(Number(result.multiplier??multiplier))
          setRealBalance(Number(result.balance_after??realBalance??0))
          setRealBetResult({round_id:result.round_id,result:'CRASHED',stake:result.stake,payout:0,net_result:-Number(result.stake??0)})
          setRealRoundKey(crypto.randomUUID());setRealCrashCashoutKey(null)
          setPracticeResult(arabic?'انفجرت الطائرة. انتهت الجولة وخسر الرهان.':'The plane crashed. The round ended and the stake was lost.')
        }
      }catch(error){if(active)setRealBetMessage(error instanceof Error?error.message:'Could not synchronize the Crash round.')}
      finally{pending=false}
    }
    const timer=window.setInterval(poll,1000)
    return()=>{active=false;window.clearInterval(timer)}
  },[selected?.id,realCrashRound?.id,realBetBusy])
  const closeGame=()=>{const modalHistory=Boolean(window.history.state?.betnovaGameModal);setSelected(null);resetDemo();if(modalHistory)window.history.back()}
  useEffect(()=>{if(!selected)return;const current=window.history.state;if(!current?.betnovaGameModal)window.history.pushState({...current,betnovaPage:'games',betnovaGameModal:true},'', '#game');const onPop=()=>{setSelected(null);resetDemo()};window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[selected])
  useEffect(()=>{if(!selected)return;const previous=document.activeElement as HTMLElement|null;modalRef.current?.focus();const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'){closeGame();return}if(event.key==='Tab'){const nodes=modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])');if(!nodes?.length){event.preventDefault();modalRef.current?.focus();return}const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}};window.addEventListener('keydown',onKeyDown);return()=>{window.removeEventListener('keydown',onKeyDown);if(slotTimer.current)clearTimeout(slotTimer.current);slotTimer.current=null;previous?.focus()}},[selected])
  useEffect(()=>{
    if(!realCrashRound)return
    const timer=window.setInterval(()=>{
      const elapsed=realCrashRound.elapsedBase+(performance.now()-realCrashRound.clientAnchor)/1000
      setMultiplier(Math.min(100,Math.floor(Math.exp(Math.max(0,elapsed)*crashRate)*100)/100))
    },50)
    return()=>window.clearInterval(timer)
  },[realCrashRound,crashRate])
  useEffect(()=>{
    const client=supabase
    if(selected?.id!=='crash'||!client)return
    let active=true
    const resume=async()=>{
      try{
        const {data,error}=await client.rpc('betnova_resume_crash_round')
        if(error)throw error
        if(!active||!data)return
        const result=(typeof data==='string'?JSON.parse(data):data) as Record<string,unknown>
        setRealBalance(Number(result.balance_after??0))
        if(result.status==='active'&&result.round_id&&result.started_at&&result.server_now){
          const elapsedBase=Math.max(0,(Date.parse(String(result.server_now))-Date.parse(String(result.started_at)))/1000)
          const rate=Number(result.curve_rate??0.06);setCrashRate(rate)
          setRealCrashRound({id:String(result.round_id),stake:Number(result.stake??0),startedAt:Date.parse(String(result.started_at)),clientAnchor:performance.now(),elapsedBase})
          setCrashActive(true);setCrashExploding(false);setMultiplier(Math.min(100,Number(result.multiplier??1)))
        }else if(result.status==='crashed'){
          setRealCrashRound(null);setCrashActive(false);setCrashExploding(true);setMultiplier(Number(result.multiplier??1))
          setRealBetResult({round_id:result.round_id,result:'CRASHED',stake:result.stake,payout:0,net_result:-Number(result.stake??0)})
        }
      }catch(error){if(active)setRealBetMessage(error instanceof Error?error.message:'Could not restore the active Crash round.')}
    }
    void resume()
    return()=>{active=false}
  },[selected?.id])
  const pickApple=(column:number)=>{
    if(appleDone||appleLevel>=APPLE_ROWS)return
    setApplePicks(current=>[...current,column])
    if(column===appleTraps[appleLevel]){setAppleDone(true);setPracticeResult(arabic?`وجدت التفاحة الخطرة في الصف ${appleLevel+1}. انتهت الجولة التدريبية.`:`Trap apple found in row ${appleLevel+1}. Practice round over.`)}
    else{const next=appleLevel+1;setAppleLevel(next);if(next>=APPLE_ROWS){setAppleDone(true);setPracticeResult(arabic?'خمسة اختيارات آمنة! اكتملت الجولة التدريبية دون جوائز أو رصيد.':'Five safe picks! Practice round completed with no prize or balance award.')}else setPracticeResult(arabic?`اختيار آمن! انتقل إلى الصف ${next+1}.`:`Safe pick! Continue to row ${next+1}.`)}
    setPracticeCount(value=>value+1)
  }
  const dropPlinko=()=>{
    if(plinkoDropping)return
    const slot=Math.floor(Math.random()*10)
    setPlinkoDropping(true);setPlinkoSlot(null);setPracticeResult(arabic?'الكرة تهبط عبر المسامير...':'Ball dropping through the pegs...')
    slotTimer.current=setTimeout(()=>{setPlinkoSlot(slot);setPlinkoDropping(false);setPracticeCount(value=>value+1);setPracticeResult(arabic?`استقرت الكرة في الخانة ${slot+1} · المضاعف المعروض ${[8,5,3,2,1.5,1.2,1.5,2,3,5][slot]}×. تدريب فقط دون إضافة رصيد.`:`Ball landed in pocket ${slot+1} · displayed demo multiplier ${[8,5,3,2,1.5,1.2,1.5,2,3,5][slot]}×. Practice only; no balance change.`);slotTimer.current=null},950)
  }
  const blackjackTotal=(hand:number[])=>{let total=hand.reduce((sum,value)=>sum+(value===11?1:value),0);if(hand.includes(11)&&total+10<=21)total+=10;return total}
  const blackjackHit=()=>{if(blackjackDone)return;const card=drawCard();const next=[...cardHand,card];setCardHand(next);const total=blackjackTotal(next);if(total>=21){setBlackjackDone(true);setPracticeResult(arabic?`مجموع أوراقك ${total}. ${total>21?'تجاوزت 21!':'وصلت إلى 21.'} انتهت الجولة التدريبية.`:`Your hand totals ${total}. ${total>21?'Bust!':'21 reached.'} Practice round complete.`)}else setPracticeResult(arabic?`أضفت ورقة. مجموعك الآن ${total}.`:`Card drawn. Your total is ${total}.`);setPracticeCount(value=>value+1)}
  const blackjackStand=()=>{if(blackjackDone||cardHand.length===0)return;let dealer=[...dealerHand];while(blackjackTotal(dealer)<17)dealer.push(drawCard());setDealerHand(dealer);setBlackjackDone(true);const player=blackjackTotal(cardHand),banker=blackjackTotal(dealer);const outcome=player>21?'bust':banker>21||player>banker?'win':player===banker?'tie':'lose';setPracticeResult(arabic?`مجموعك ${player} · الموزع ${banker} · ${outcome==='win'?'فزت في التدريب':outcome==='tie'?'تعادل':'انتهت الجولة'}. دون أموال أو جوائز.`:`You ${player} · Dealer ${banker} · ${outcome.toUpperCase()}. Practice only; no money or prizes.`);setPracticeCount(value=>value+1)}
  const spinRoulette=()=>{if(rouletteSpinning)return;const n=Math.floor(Math.random()*37);setRouletteNumber(null);setRouletteSpinning(true);setPracticeResult(arabic?'تدور العجلة...':'Wheel spinning...');slotTimer.current=setTimeout(()=>{setRouletteNumber(n);const color=n===0?'GREEN':rouletteReds.has(n)?'RED':'BLACK';setPracticeResult(arabic?`نتيجة العجلة التدريبية: ${n} · ${color==='GREEN'?'أخضر':color==='RED'?'أحمر':'أسود'}. ليست نتيجة رهان حقيقي.`:`Practice wheel: ${n} · ${color}. No real roulette result.`);setPracticeCount(value=>value+1);setRouletteSpinning(false);slotTimer.current=null},1250)}
  const spinSlots=()=>{if(!selected||slotSpinning)return;const symbols=selected.id==='lucky-fruits'?['🍒','🍋','🍉','🍇','⭐','7️⃣']:selected.id==='pharaoh'?['𓂀','👑','⚱️','🐪','💎','☀️']:selected.id==='coyote-jackpot'?['🐺','🌵','⭐','💎','7️⃣','🪙']:['🪐','🌟','🚀','🌙','💫','👾'];const reels=Array.from({length:9},()=>choose(symbols));setSlotSpinning(true);setPracticeResult(arabic?'تدور البكرات...':'Reels spinning...');slotTimer.current=setTimeout(()=>{setSlotSymbols(reels);const match=reels.some((s,i)=>i%3===0&&s===reels[i+1]&&s===reels[i+2]);setPracticeResult(arabic?`نتيجة اللف: ${reels.join('  ')}. ${match?'تطابق رمزي في العرض التجريبي!':'لا يوجد تطابق هذه المرة.'} لا توجد أرباح أو جوائز.`:`Practice spin: ${reels.join('  ')}. ${match?'Three matching symbols!':'No match this time.'} Display-only; no payout.`);setPracticeCount(value=>value+1);setSlotSpinning(false);slotTimer.current=null},850)}
  const runOtherDemo=()=>{
    if(!selected)return
    let result=''
    switch(selected.id){
      case 'lucky-fruits': case 'pharaoh': case 'space-spin': case 'coyote-jackpot': return spinSlots();
      case 'roulette': return spinRoulette();
      case 'blackjack': {const cards=[drawCard(),drawCard()];setCardHand(cards);setDealerHand([drawCard()]);const total=blackjackTotal(cards);const natural=total===21;setBlackjackDone(natural);result=arabic?`بدأت الجولة. مجموع أوراقك ${total}. ${natural?'21! انتهت الجولة تلقائياً.':'اسحب ورقة أو قف.'}`:`New practice hand. Your total is ${total}. ${natural?'21! Round complete.':'Hit or stand.'}`;break}
      case 'baccarat': {const player=[drawCard(),drawCard()],banker=[drawCard(),drawCard()];let pt=baccaratTotal(player),bt=baccaratTotal(banker);if(pt<8&&bt<8){let playerThird:number|undefined;if(pt<=5){playerThird=drawCard();player.push(playerThird);pt=baccaratTotal(player)}const bankerDraw=playerThird===undefined?bt<=5:bt<=2||bt===3&&baccaratValue(playerThird)!==8||bt===4&&baccaratValue(playerThird)>=2&&baccaratValue(playerThird)<=7||bt===5&&baccaratValue(playerThird)>=4&&baccaratValue(playerThird)<=7||bt===6&&(baccaratValue(playerThird)===6||baccaratValue(playerThird)===7);if(bankerDraw){banker.push(drawCard());bt=baccaratTotal(banker)}}setBaccaratHand({player,banker});const winner=pt===bt?'tie':pt>bt?'player':'banker';result=arabic?`اللاعب ${player.map(cardLabel).join('، ')} = ${pt} · المصرف ${banker.map(cardLabel).join('، ')} = ${bt} · ${winner==='tie'?'تعادل':winner==='player'?'فوز اللاعب':'فوز المصرف'}. تدريب فقط.`:`Player ${player.map(cardLabel).join(', ')} = ${pt} · Banker ${banker.map(cardLabel).join(', ')} = ${bt} · ${winner.toUpperCase()}. Practice only.`;break}
    }
    setPracticeResult(result);setPracticeCount(value=>value+1)
  }
  const playRealRound=async()=>{
    if(!selected||selected.id==='crash'||selected.id==='apple'||paidTableUnavailable||!supabase)return
    const stake=Number(realStake)
    if(!Number.isFinite(stake)||stake<=0||Math.round(stake*100)!==stake*100){setRealBetMessage(arabic?'أدخل مبلغاً صحيحاً بالدينار الجزائري.':'Enter a valid DZD stake with up to two decimals.');return}
    if(realBalance!==null&&stake>realBalance){setRealBetMessage(arabic?'رصيدك المتاح غير كافٍ.':'Your available balance is insufficient.');return}
    setRealBetBusy(true);setRealBetMessage('');setRealBetResult(null)
    const animationStarted=Date.now()
    if(selected.id==='plinko'){setPlinkoDropping(true);setPlinkoSlot(null)}
    if(['lucky-fruits','pharaoh','space-spin'].includes(selected.id))setSlotSpinning(true)
    if(selected.id==='roulette')setRouletteSpinning(true)
    try{
      const {data:{user},error:authError}=await supabase.auth.getUser()
      if(authError)throw authError
      if(!user)throw new Error(arabic?'سجّل الدخول أولاً للمراهنة.':'Sign in before starting the game.')
      const {data,error}=await supabase.rpc('betnova_play_arcade_round',{
        p_game_id:selected.id,p_stake:stake,p_choice:realChoice,p_idempotency_key:realRoundKey
      })
      if(error)throw error
      const result=(typeof data==='string'?JSON.parse(data):data) as Record<string,unknown>
      if(!result||!result.round_id)throw new Error('No round receipt was returned. Check game history before retrying.')
      const animationDuration=selected.id==='plinko'?3800:['lucky-fruits','pharaoh','space-spin'].includes(selected.id)?1350:selected.id==='roulette'?1100:0
      const remaining=Math.max(0,animationDuration-(Date.now()-animationStarted))
      if(remaining)await new Promise(resolve=>window.setTimeout(resolve,remaining))
      if(selected.id==='plinko')setPlinkoDropping(false)
      if(['lucky-fruits','pharaoh','space-spin'].includes(selected.id)){
        const outcome=String(result.result??'')
        const reels=selected.id==='lucky-fruits'
          ?outcome==='JACKPOT'?['7️⃣','7️⃣','7️⃣']:outcome==='FRUIT_TRIPLE'?['🍉','🍉','🍉']:outcome==='FRUIT_PAIR'?['🍒','🍒','🍋']:['🍒','🍋','🍉']
          :selected.id==='pharaoh'
            ?outcome==='PHARAOH_JACKPOT'?['𓂀','𓂀','𓂀']:outcome==='ROYAL_TREASURE'?['💎','💎','👑']:outcome==='SCARAB'?['𓂀','𓂀','⚱️']:['☀️','🐪','⚱️']
            :outcome==='COSMIC_JACKPOT'?['🚀','🚀','🚀']:outcome==='PLANET_TRIPLE'?['🪐','🪐','🪐']:outcome==='STAR_PAIR'?['🌟','🌟','🌙']:['🪐','🌙','👾']
        setSlotSymbols(reels);setSlotSpinning(false)
      }
      if(selected.id==='roulette'){setRouletteNumber(Number((result.details as Record<string,unknown>|undefined)?.number??0));setRouletteSpinning(false)}
      if(selected.id==='apple'){setAppleLevel(Number(realChoice));setAppleDone(true)}
      let outcomeText=String(result.result??'')
      if(selected.id==='apple')outcomeText=result.won?(arabic?'مسار آمن!':'Safe path!'):(arabic?'وجدت التفاحة الخطرة.':'Trap found.')
      else if(selected.id==='plinko')outcomeText=result.won?(arabic?'أصابت الكرة خانة رابحة!':'The ball landed in a winning slot!'):(arabic?'لم تصب الكرة خانة رابحة.':'The ball landed in a losing slot.')
      else if(['lucky-fruits','pharaoh','space-spin'].includes(selected.id))outcomeText=result.won?(arabic?'مبروك! فزت في الجولة.':'Congratulations! You won the round.'):(arabic?'لم تفز هذه المرة.':'No win this time.')
      else if(selected.id==='roulette')outcomeText=arabic?'النتيجة '+String((result.details as Record<string,unknown>|undefined)?.number??'—')+' · '+(result.won?'فوز':'لم تفز'):'Result '+String((result.details as Record<string,unknown>|undefined)?.number??'—')+' · '+(result.won?'WIN':'NO WIN')
      setPracticeCount(value=>value+1)
      setPracticeResult(outcomeText)
      setRealBetResult(result)
      setRealBalance(Number(result.balance_after??0))
      setRealRoundKey(crypto.randomUUID())
    }catch(error){
      setRealBetMessage(error instanceof Error?error.message:'The round could not be confirmed. Retry safely; duplicate requests use the same round key.')
      setPlinkoDropping(false);setSlotSpinning(false);setRouletteSpinning(false)
    }finally{setRealBetBusy(false)}
  }
  const startRealCrash=async()=>{
    if(!selected||selected.id!=='crash'||!supabase||realCrashRound||realBetBusy)return
    const stake=Number(realStake)
    if(!Number.isFinite(stake)||stake<=0||Math.round(stake*100)!==stake*100){setRealBetMessage(arabic?'أدخل مبلغاً صحيحاً بالدينار الجزائري.':'Enter a valid DZD stake with up to two decimals.');return}
    if(realBalance!==null&&stake>realBalance){setRealBetMessage(arabic?'رصيدك المتاح غير كافٍ.':'Your available balance is insufficient.');return}
    setRealBetBusy(true);setRealBetMessage('');setRealBetResult(null)
    try{
      const {data:{user},error:authError}=await supabase.auth.getUser()
      if(authError)throw authError
      if(!user)throw new Error(arabic?'سجّل الدخول أولاً للمراهنة.':'Sign in before starting Crash.')
      const {data,error}=await supabase.rpc('betnova_start_crash_round',{p_stake:stake,p_idempotency_key:realRoundKey})
      if(error)throw error
      const result=(typeof data==='string'?JSON.parse(data):data) as Record<string,unknown>
      if(!result?.round_id||result.status!=='active')throw new Error(arabic?'تعذر بدء الجولة. تحقق من سجل الألعاب.':'The Crash round did not start. Check game history before retrying.')
      const elapsedBase=Math.max(0,(Date.parse(String(result.server_now))-Date.parse(String(result.started_at)))/1000)
      const rate=Number(result.curve_rate??0.075);setCrashRate(rate)
      setRealCrashRound({id:String(result.round_id),stake,startedAt:Date.parse(String(result.started_at)),clientAnchor:performance.now(),elapsedBase})
      setCrashActive(true);setCrashExploding(false);setMultiplier(Math.min(100,Math.floor(Math.exp(elapsedBase*rate)*100)/100))
      setRealBalance(Number(result.balance_after??0));setRealRoundKey(crypto.randomUUID())
      requestAnimationFrame(()=>modalRef.current?.scrollTo({top:0,behavior:'smooth'}))
    }catch(error){setRealBetMessage(error instanceof Error?error.message:'Could not start Crash. A retry with the same request key will not charge twice.')}
    finally{setRealBetBusy(false)}
  }
  const startRealApple=async()=>{
    if(!selected||selected.id!=='apple'||!supabase||realAppleRound||realBetBusy)return
    const stake=Number(realStake)
    if(!Number.isFinite(stake)||stake<=0||Math.round(stake*100)!==stake*100){setRealBetMessage(arabic?'أدخل مبلغاً صحيحاً بالدينار الجزائري.':'Enter a valid DZD stake with up to two decimals.');return}
    if(realBalance!==null&&stake>realBalance){setRealBetMessage(arabic?'رصيدك المتاح غير كافٍ.':'Your available balance is insufficient.');return}
    setRealBetBusy(true);setRealBetMessage('');setRealBetResult(null)
    try{const {data,error}=await supabase.rpc('betnova_start_apple_round',{p_stake:stake,p_idempotency_key:realRoundKey});if(error)throw error;const result=(typeof data==='string'?JSON.parse(data):data) as Record<string,unknown>;if(!result?.round_id||result.status!=='active')throw new Error(arabic?'تعذر بدء جولة التفاحة.':'The Apple round did not start.');setRealAppleRound({id:String(result.round_id),stake,currentRow:Number(result.current_row??0),multiplier:0});setAppleLevel(0);setAppleDone(false);setApplePicks([]);setPracticeResult(arabic?'اختر تفاحة من الصف الأول.':'Pick an apple in the first row.');setRealBalance(Number(result.balance_after??realBalance??0));setRealRoundKey(crypto.randomUUID())}
    catch(error){setRealBetMessage(error instanceof Error?error.message:'Could not start Apple.')}
    finally{setRealBetBusy(false)}
  }
  const pickRealApple=async(column:number)=>{
    if(!realAppleRound||!supabase||realBetBusy||appleDone)return
    setRealBetBusy(true);setRealBetMessage('')
    try{
      const {data,error}=await supabase.rpc('betnova_pick_apple',{p_round_id:realAppleRound.id,p_column:column,p_idempotency_key:applePickKey});if(error)throw error
      const result=(typeof data==='string'?JSON.parse(data):data) as Record<string,unknown>;const row=Number(result.current_row??appleLevel+1)
      setApplePicks(current=>[...current.slice(0,row-1),column]);setAppleLevel(result.safe?row:row-1);setApplePickKey(crypto.randomUUID());setRealBalance(Number(result.balance_after??realBalance??0))
      if(result.safe&&result.status==='active'){const nextMultiplier=Number(result.multiplier??0);setRealAppleRound(current=>current?{...current,currentRow:row,multiplier:nextMultiplier}:current);setPracticeResult(arabic?'اختيار آمن! العائد الحالي '+nextMultiplier.toFixed(2)+'×':'Safe apple! Current return '+nextMultiplier.toFixed(2)+'×')}
      else{setRealAppleRound(null);setAppleDone(true);const won=Boolean(result.won);setPracticeResult(won?(arabic?'أكملت جميع الصفوف! تمت إضافة أرباحك.':'All rows cleared! Your winnings were paid.'):(arabic?'وجدت التفاحة الخطرة. انتهت الجولة.':'Trap apple! The round is over.'));setRealBetResult({round_id:result.round_id,result:won?'APPLE_COMPLETE':'TRAP_FOUND',stake:result.stake??realStake,payout:result.payout??0,net_result:result.net_result??-Number(result.stake??realStake)});setRealRoundKey(crypto.randomUUID())}
    }catch(error){setRealBetMessage(error instanceof Error?error.message:'Could not confirm this apple. Try again.')}
    finally{setRealBetBusy(false)}
  }
  const cashOutRealApple=async()=>{
    if(!realAppleRound||!supabase||realBetBusy)return
    const cashoutKey=appleCashoutKey??crypto.randomUUID();if(!appleCashoutKey)setAppleCashoutKey(cashoutKey)
    setRealBetBusy(true);setRealBetMessage('')
    try{const {data,error}=await supabase.rpc('betnova_cashout_apple_round',{p_round_id:realAppleRound.id,p_idempotency_key:cashoutKey});if(error)throw error;const result=(typeof data==='string'?JSON.parse(data):data) as Record<string,unknown>;setRealBalance(Number(result.balance_after??realBalance??0));setRealBetResult(result);setAppleCashoutKey(null);setRealAppleRound(null);setAppleDone(true);setPracticeResult(arabic?'تم سحب أرباحك وإضافتها إلى رصيدك.':'Winnings cashed out to your balance.');setRealRoundKey(crypto.randomUUID())}
    catch(error){setRealBetMessage(error instanceof Error?error.message:'Apple cash-out failed.')}
    finally{setRealBetBusy(false)}
  }
  const cashOutRealCrash=async()=>{
    if(!realCrashRound||!supabase||realBetBusy)return
    const key=realCrashCashoutKey??crypto.randomUUID()
    if(!realCrashCashoutKey)setRealCrashCashoutKey(key)
    setRealBetBusy(true);setRealBetMessage('')
    try{
      const {data,error}=await supabase.rpc('betnova_cashout_crash_round',{p_round_id:realCrashRound.id,p_idempotency_key:key})
      if(error)throw error
      const result=(typeof data==='string'?JSON.parse(data):data) as Record<string,unknown>
      setRealBalance(Number(result.balance_after??realBalance??0));setRealBetResult(result)
      setMultiplier(Math.min(100,Number(result.server_multiplier??result.multiplier??multiplier)))
      setRealCrashRound(null);setRealCrashCashoutKey(null);setCrashActive(false)
      const crashed=result.status==='crashed'||result.result==='CRASHED'
      setCrashExploding(crashed)
      setPracticeResult(crashed?(arabic?'انفجرت الطائرة قبل تأكيد السحب. خسرت رهان هذه الجولة.':'The plane crashed before cash-out was confirmed. This round lost.'):(arabic?'تم سحب الأرباح وإضافتها إلى رصيدك.':'Cash-out confirmed and winnings added to your balance.'))
      setRealRoundKey(crypto.randomUUID())
    }catch(error){setRealBetMessage(error instanceof Error?error.message:'Cash-out confirmation failed. Retry; the same request key prevents duplicate payout.')}
    finally{setRealBetBusy(false)}
  }
  const paidTableUnavailable=selected?.id==='blackjack'||selected?.id==='baccarat'||selected?.id==='coyote-jackpot'
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
        <div className="game-tile-copy"><div className="game-tile-meta"><span>{translatedGameTag(game.id)}</span><span className="game-live-dot"/></div><h3>{game.name}</h3><p>{translatedGameDescription(game.id)}</p><button type="button" onClick={()=>{setSelected(game);resetDemo(game.id)}}>{labels.explore} <ArrowRight size={14}/></button></div>
      </article>)}
    </div>
    <div className="games-safety-note"><Sparkles size={15}/><span>{labels.safety}</span></div>
    {selected&&<div className="game-detail-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)closeGame()}}>
      <section ref={modalRef} tabIndex={-1} className={`game-detail-modal game-${selected.accent}`} role="dialog" aria-modal="true" aria-labelledby="game-detail-title">
        <div className="game-detail-close-row"><button className="game-detail-close" type="button" onClick={closeGame} aria-label={labels.close}><X size={20}/></button></div>
        {selected.id!=='crash'&&<div className={`game-detail-art art-${selected.art}`}><span>{selected.mark}</span><i/><b>BETNOVA</b></div>}
        <div className="games-kicker"><Sparkles size={14}/> {translatedGameTag(selected.id)}</div><h3 id="game-detail-title">{selected.name}</h3><p>{translatedGameDescription(selected.id)}</p>
        {selected.id==='crash'&&<div className="game-practice-controls crash-controls">
          <div className={`crash-flight-stage ${crashActive?'is-flying':crashExploding?'is-exploding':multiplier>1?'flight-ended':'flight-ready'}`} style={{'--crash-heli-left':`${5+Math.max(0,Math.min(1,Math.log(Math.max(1,multiplier))/Math.log(8)))*67}%`,'--crash-heli-top':`${66-Math.max(0,Math.min(1,Math.log(Math.max(1,multiplier))/Math.log(8)))*45}%`} as CSSProperties} role="img" aria-label={arabic?'طائرة كراش تطير داخل مسار ثلاثي الأبعاد':'Crash airplane flying through a 3D flight arena'}>
            <div className="crash-sky-grid"/><div className="crash-sun-glow"/><div className="crash-cloud cloud-a"/><div className="crash-cloud cloud-b"/>
            <div className="crash-mountains mountain-back"/><div className="crash-mountains mountain-front"/>
            <div className="crash-flight-path"/><div className="crash-flight-trail" style={{width:(Math.max(0,Math.min(1,Math.log(Math.max(1,multiplier))/Math.log(8)))*70)+'%',opacity:crashActive?0.9:0}}/>
            <div className={`crash-helicopter ${crashActive?'helicopter-flying':crashExploding?'helicopter-crashed':'helicopter-idle'}`} style={{left:(5+Math.max(0,Math.min(1,Math.log(Math.max(1,multiplier))/Math.log(8)))*67)+'%',top:(66-Math.max(0,Math.min(1,Math.log(Math.max(1,multiplier))/Math.log(8)))*45)+'%'}} aria-hidden="true">
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
          <div className="crash-auto-status">{crashActive?(arabic?'الطائرة في الجو':'IN FLIGHT'):crashExploding?(arabic?'انفجرت الطائرة':'CRASHED'):(arabic?'أدخل الرهان ثم ابدأ':'SET YOUR STAKE TO START')}</div>
          {realCrashRound&&<button className="arcade-wager-submit arcade-crash-cashout crash-inline-cashout" type="button" onClick={cashOutRealCrash} disabled={realBetBusy}>{realBetBusy?(arabic?'جارٍ السحب...':'CASHING OUT...'):(arabic?'اسحب الأرباح':'CASH OUT')+' · '+multiplier.toFixed(2)+'×'}</button>}
        </div>}
        {selected.id==='apple'&&<div className="game-practice-controls apple-odds-board">
          <div className="apple-board">{Array.from({length:APPLE_ROWS},(_,row)=>{const rowNumber=row+1;const odds=0.95/Math.pow(0.8,rowNumber);return <div className={"apple-odds-row "+(row<appleLevel?'cleared':row===appleLevel&&realAppleRound?'current':realBetResult?.result==='TRAP_FOUND'&&row===appleLevel?'failed':'')} key={rowNumber}><div className="apple-odds-fruits">{Array.from({length:APPLE_COLUMNS},(_,col)=><button type="button" className={applePicks[row]===col?(realBetResult?.result==='TRAP_FOUND'&&row===appleLevel?'trap':'picked'):''} key={col} onClick={()=>void pickRealApple(col)} disabled={!realAppleRound||row!==appleLevel||realBetBusy||appleDone} aria-label={arabic?'اختر التفاحة':'Pick apple'}>🍏</button>)}</div><strong className="apple-row-multiplier">{odds.toFixed(2)}×</strong></div>})}</div>
          {realAppleRound&&appleLevel>0&&<button type="button" className="apple-cashout-button" onClick={()=>void cashOutRealApple()} disabled={realBetBusy}>{arabic?'اسحب':'CASH OUT'} · {(realAppleRound.stake*realAppleRound.multiplier).toFixed(2)} DZD</button>}
        </div>}
        {selected.id==='plinko'&&<div className="game-practice-controls"><div className="plinko-board"><span className={plinkoDropping?'plinko-ball dropping':'plinko-ball'} aria-hidden="true">●</span><div className="plinko-pegs">{Array.from({length:9},(_,row)=><div className="plinko-peg-row" key={row}>{Array.from({length:row+3},(_,col)=><i key={col}/>)}</div>)}</div><div className="plinko-slots">{[8,5,3,2,1.5,1.2,1.5,2,3,5].map((odds,i)=><span className={plinkoSlot===i?'landed':''} key={i}>{odds}×</span>)}</div></div></div>}
        {['lucky-fruits','pharaoh','space-spin','coyote-jackpot'].includes(selected.id)&&<div className={"game-practice-controls slot-theme slot-theme-"+selected.id}><div className="slot-reels" aria-label={selected.name}>{slotSymbols.map((symbol,i)=><span className={slotSpinning?'spinning':''} key={i}>{symbol}</span>)}</div></div>}
        {selected.id==='roulette'&&<div className="game-practice-controls"><div className="roulette-preview"><div className={"roulette-wheel "+(rouletteSpinning?'spinning':'')}><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><b>{rouletteNumber===null?'?':rouletteNumber}</b></div><small>{rouletteSpinning?(arabic?'العجلة تدور...':'WHEEL SPINNING'):rouletteNumber===null?(arabic?'جاهز':'READY'):rouletteNumber===0?(arabic?'صفر أخضر':'GREEN ZERO'):rouletteReds.has(rouletteNumber)?(arabic?'أحمر':'RED'):(arabic?'أسود':'BLACK')}</small></div></div>}
        {selected.id==='blackjack'&&<div className="game-practice-controls"><div className="practice-playing-cards"><span>♠</span><span>♥</span></div></div>}
        {selected.id==='baccarat'&&<div className="game-practice-controls"><div className="baccarat-preview"><div><small>{arabic?'اللاعب':'PLAYER'}</small><strong>—</strong></div><div><small>{arabic?'المصرف':'BANKER'}</small><strong>—</strong></div></div></div>}
        <section className="arcade-wager-panel arcade-wager-simple" aria-label={arabic?'رهان اللعبة':'Game wager'}>
          {paidTableUnavailable?<div className="arcade-coming-note">{arabic?'هذه اللعبة غير متاحة للرهان حالياً.':'Real-money play is not available for this table yet.'}</div>:<>
            <div className="arcade-wallet-line"><span>{arabic?'رصيدك':'Your balance'}</span><strong>{realBalance===null?'—':realBalance.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' DZD'}</strong></div>
            {selected.id==='roulette'&&<div className="arcade-choice-row"><button type="button" className={realChoice==='red'?'active':''} onClick={()=>setRealChoice('red')} disabled={realBetBusy}>{arabic?'أحمر':'RED'}</button><button type="button" className={realChoice==='black'?'active':''} onClick={()=>setRealChoice('black')} disabled={realBetBusy}>{arabic?'أسود':'BLACK'}</button></div>}
            <label className="arcade-wager-field"><span>{arabic?'مبلغ الرهان (DZD)':'Stake (DZD)'}</span><input type="number" min="0.01" max="1000000" step="0.01" inputMode="decimal" value={realStake} onChange={event=>setRealStake(event.target.value)} disabled={realBetBusy||(selected.id==='crash'&&Boolean(realCrashRound))||(selected.id==='apple'&&Boolean(realAppleRound))}/></label>
            {selected.id==='crash'?(!realCrashRound?<button className="arcade-wager-submit" type="button" onClick={startRealCrash} disabled={realBetBusy||realBalance===null||!supabase}>{realBetBusy?(arabic?'جارٍ البدء...':'STARTING...'):arabic?'ابدأ اللعبة':'START GAME'}</button>:null):selected.id==='apple'?(!realAppleRound?<button className="arcade-wager-submit" type="button" onClick={startRealApple} disabled={realBetBusy||realBalance===null||!supabase}>{realBetBusy?(arabic?'جارٍ البدء...':'STARTING...'):arabic?'ابدأ اللعبة':'START GAME'}</button>:null):<button className="arcade-wager-submit" type="button" onClick={playRealRound} disabled={realBetBusy||realBalance===null||!supabase}>{realBetBusy?(arabic?'جارٍ اللعب...':'PLAYING...'):arabic?'ابدأ اللعبة':'START GAME'}</button>}
            {realBetMessage&&<p className="arcade-wager-error" role="alert">{realBetMessage}</p>}
            {realBetResult&&<div className="arcade-wager-receipt" role="status"><strong>{practiceResult|| (arabic?'انتهت الجولة':'ROUND COMPLETE')}</strong><span>{arabic?'الرهان':'Stake'}: {Number(realBetResult.stake??0).toFixed(2)} DZD</span><span>{arabic?'العائد':'Payout'}: {Number(realBetResult.payout??0).toFixed(2)} DZD</span></div>}
          </>}
        </section>
        <button className="game-detail-secondary" type="button" onClick={closeGame}>{labels.close}</button>
      </section>
    </div>}
  </section>
}
