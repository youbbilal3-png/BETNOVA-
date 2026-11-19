import { Activity, ArrowRight, ShieldCheck, Trophy, Wallet, Flame, Sparkles, Globe2 } from 'lucide-react'
import { languages } from './i18n'

type Props = {
  isArabic: boolean
  language: string
  onLanguageChange: (value: string) => void
  onSignup: () => void
  onLogin: () => void
}

export default function PublicLanding({ isArabic, language, onLanguageChange, onSignup, onLogin }: Props) {
  return <div className="public-landing" dir={isArabic ? 'rtl' : 'ltr'}>
    <header className="public-header">
      <a className="public-brand" href="#"><span className="public-brand-mark"><Activity size={22}/></span><span>BET<span>NOVA</span><small>THE GAME, REIMAGINED</small></span></a>
      <nav className="public-links"><a href="#platform">{isArabic ? 'المنصة' : 'Platform'}</a><a href="#markets">{isArabic ? 'الأسواق' : 'Markets'}</a><a href="#security">{isArabic ? 'الأمان' : 'Security'}</a></nav>
      <div className="public-actions">
        <label className="public-language"><Globe2 size={15}/><select value={language} onChange={e=>onLanguageChange(e.target.value)}>{languages.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <button className="public-login" onClick={onLogin}>{isArabic ? 'دخول' : 'Log in'}</button>
        <button className="public-signup" onClick={onSignup}>{isArabic ? 'إنشاء حساب' : 'Create account'} <ArrowRight size={16}/></button>
      </div>
    </header>
    <main className="public-main">
      <section className="public-hero">
        <div className="public-hero-copy">
          <div className="public-kicker"><span/> {isArabic ? 'منصة رياضية من الجيل الجديد' : 'THE NEXT-GENERATION SPORTS PLATFORM'} <strong className="public-bonus-tag">{isArabic ? 'مكافأة ترحيبية 100 : '$100 WELCOME BONUS'}</strong></div>
          <h1>{isArabic ? <>كل مباراة.<br/><em>تجربة مختلفة.</em></> : <>Every match.<br/><em>A new dimension.</em></>}</h1>
          <p>{isArabic ? 'تابع الأحداث الرياضية، اكتشف الأسواق، وادِر اختياراتك من تجربة مصممة لتناسب هاتفك.' : 'Follow the action, explore match markets and manage your picks in a sports experience built for your phone.'}</p>
          <div className="public-hero-buttons"><button className="public-primary" onClick={onSignup}>{isArabic ? 'ابدأ الآن' : 'Get started'} <ArrowRight size={18}/></button><button className="public-secondary" onClick={()=>document.getElementById('platform')?.scrollIntoView({behavior:'smooth'})}>{isArabic ? 'اكتشف المنصة' : 'Explore the platform'}</button></div>
          <div className="public-trust"><span><ShieldCheck size={16}/>{isArabic ? 'تجربة تركّز على حسابك' : 'Account-first experience'}</span><span><Wallet size={16}/>{isArabic ? 'عدة عملات' : 'Multi-currency ready'}</span></div><div className="public-bonus-note">{isArabic ? 'إيداع مؤكد بقيمة 10$ (2,600 دج أو 9€) يفتح إمكانية سحب المكافأة، ويُضاف كاملاً إلى رصيدك الحقيقي.' : 'A verified $10 deposit ($2,600 DZD or €9) unlocks bonus withdrawal and is credited in full to your real-money balance.'}</div>
        </div>
        <div className="public-visual">
          <div className="visual-glow"/><div className="visual-orbit orbit-one"/><div className="visual-orbit orbit-two"/>
          <div className="visual-ball">⚽</div>
          <div className="visual-chip chip-live"><i/> {isArabic ? 'مركز المباريات' : 'MATCH CENTER'}</div>
          <div className="visual-score-card"><div className="score-card-top"><span>{isArabic ? 'معاينة المنصة' : 'PLATFORM PREVIEW'}</span><span>BETNOVA</span></div><div className="score-teams"><div><b>⚽</b><strong>{isArabic ? 'الفريق الأول' : 'HOME'}</strong></div><span>VS</span><div><b>🏆</b><strong>{isArabic ? 'الفريق الثاني' : 'AWAY'}</strong></div></div><div className="score-markets"><span>1X2</span><span>OVER / UNDER</span><span>BTTS</span></div></div>
          <div className="visual-float float-top"><Trophy size={16}/><span>{isArabic ? 'الرياضة في مكان واحد' : 'SPORTS IN ONE PLACE'}</span></div>
          <div className="visual-float float-bottom"><Sparkles size={16}/><span>{isArabic ? 'مصمم للهاتف أولاً' : 'MOBILE-FIRST DESIGN'}</span></div>
        </div>
        <div className="public-scroll-hint">{isArabic ? 'مرّر لاكتشاف المزيد' : 'SCROLL TO DISCOVER'} <span/></div>
      </section>
      <section className="public-platform" id="platform">
        <div className="public-section-heading"><span>{isArabic ? 'لماذا BETNOVA؟' : 'THE BETNOVA EXPERIENCE'}</span><h2>{isArabic ? 'كل ما تحتاجه. في تجربة واحدة.' : 'Everything in one seamless experience.'}</h2><p>{isArabic ? 'واجهة واضحة وسريعة، مبنية لتجعل الوصول إلى أدواتك أسهل.' : 'A clear, fast interface designed to put the tools you need right where you expect them.'}</p></div>
        <div className="public-feature-grid">
          <article className="public-feature"><div className="feature-icon blue"><Activity/></div><small>01 / LIVE</small><h3>{isArabic ? 'مركز الأحداث' : 'Live match center'}</h3><p>{isArabic ? 'تابع المباريات والنتائج والأحداث من مكان واحد.' : 'Follow fixtures, scores and match activity from one place.'}</p></article>
          <article className="public-feature"><div className="feature-icon violet"><Flame/></div><small>02 / MARKETS</small><h3>{isArabic ? 'أسواق متنوعة' : 'Markets that matter'}</h3><p>{isArabic ? 'اكتشف أسواق المباريات المتاحة بوضوح.' : 'Explore available match markets through a clean layout.'}</p></article>
          <article className="public-feature"><div className="feature-icon cyan"><Wallet/></div><small>03 / WALLET</small><h3>{isArabic ? 'محفظة متعددة العملات' : 'Flexible wallet'}</h3><p>{isArabic ? 'تجربة مصممة لدعم الدينار والدولار واليورو.' : 'A wallet experience designed around DZD, USD and EUR.'}</p></article>
          <article className="public-feature" id="security"><div className="feature-icon pink"><ShieldCheck/></div><small>04 / CONTROL</small><h3>{isArabic ? 'تحكم ووضوح' : 'Clarity and control'}</h3><p>{isArabic ? 'إعدادات الحساب وسجل اختياراتك في واجهة منظمة.' : 'Account tools and your activity, organized in one intuitive space.'}</p></article>
        </div>
      </section>
      <section className="public-markets" id="markets"><div><span>{isArabic ? 'ابدأ رحلتك' : 'YOUR GAME. YOUR WAY.'}</span><h2>{isArabic ? 'ادخل إلى عالم BETNOVA' : 'Step into BETNOVA.'}</h2><p>{isArabic ? 'أنشئ حسابك للوصول إلى المباريات والأسواق وأدوات حسابك.' : 'Create your account to access matches, markets and your personal account tools.'}</p></div><button onClick={onSignup}>{isArabic ? 'إنشاء حساب' : 'Create your account'} <ArrowRight size={17}/></button></section>
    </main>
    <footer className="public-footer"><a className="public-brand" href="#"><span className="public-brand-mark"><Activity size={19}/></span><span>BET<span>NOVA</span></span></a><span>© 2026 BETNOVA · {isArabic ? 'استمتع بالرياضة بمسؤولية' : 'Enjoy sports responsibly'}</span></footer>
  </div>
}
