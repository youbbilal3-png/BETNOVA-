import { useLanguage } from '../i18n'

const words: Record<string, string[]> = {
 en:['More markets','Odds not supplied','Goals','Match result','Corners','Cards','Shots','Match events','Over','Under','Yes','No','Win 1','Draw','Win 2','Double chance','Both teams to score','First team to score','Yellow cards total','Red cards total','Total corners','Total shots','Shots on target','VAR decision','Penalty awarded','These markets are shown as a catalogue. Prices and bet selection activate only after a trusted source supplies verified odds.'],
 ar:['أسواق إضافية','الاحتمالات غير متوفرة','الأهداف','نتيجة المباراة','الركنيات','البطاقات','التسديدات','أحداث المباراة','أكثر من','أقل من','نعم','لا','فوز 1','تعادل','فوز 2','الفرصة المزدوجة','كلا الفريقين يسجلان','أول فريق يسجل','مجموع البطاقات الصفراء','مجموع البطاقات الحمراء','مجموع الركنيات','مجموع التسديدات','التسديدات على المرمى','قرار تقنية VAR','احتساب ركلة جزاء','تظهر هذه الأسواق كقائمة. لا تتفعّل الأسعار والاختيارات إلا بعد وصول احتمالات موثوقة من مصدر بيانات معتمد.'],
 fr:['Autres marchés','Cotes indisponibles','Buts','Résultat du match','Corners','Cartons','Tirs','Événements','Plus de','Moins de','Oui','Non','Victoire 1','Nul','Victoire 2','Double chance','Les deux équipes marquent','Première équipe à marquer','Total cartons jaunes','Total cartons rouges','Total corners','Total tirs','Tirs cadrés','Décision VAR','Penalty accordé','Catalogue des marchés. Les cotes et sélections ne seront activées qu’après réception de données vérifiées.'],
 es:['Más mercados','Cuotas no disponibles','Goles','Resultado','Córners','Tarjetas','Disparos','Eventos','Más de','Menos de','Sí','No','Gana 1','Empate','Gana 2','Doble oportunidad','Ambos equipos marcan','Primer equipo en marcar','Total tarjetas amarillas','Total tarjetas rojas','Total córners','Total disparos','Tiros a puerta','Decisión VAR','Penalti concedido','Catálogo de mercados. Las cuotas y selecciones se activarán solo con datos verificados.'],
 pt:['Mais mercados','Odds indisponíveis','Golos','Resultado','Cantos','Cartões','Remates','Eventos','Mais de','Menos de','Sim','Não','Vitória 1','Empate','Vitória 2','Dupla hipótese','Ambas marcam','Primeira equipa a marcar','Total cartões amarelos','Total cartões vermelhos','Total cantos','Total remates','Remates à baliza','Decisão VAR','Penálti assinalado','Catálogo de mercados. As odds só serão ativadas com dados verificados.'],
 de:['Weitere Märkte','Quoten nicht verfügbar','Tore','Spielausgang','Ecken','Karten','Schüsse','Spielereignisse','Über','Unter','Ja','Nein','Sieg 1','Unentschieden','Sieg 2','Doppelte Chance','Beide Teams treffen','Erstes Team mit Tor','Gelbe Karten gesamt','Rote Karten gesamt','Ecken gesamt','Schüsse gesamt','Schüsse aufs Tor','VAR-Entscheidung','Elfmeter gegeben','Marktkatalog. Quoten und Auswahl werden erst mit verifizierten Daten aktiviert.'],
 it:['Altri mercati','Quote non disponibili','Gol','Esito partita','Corner','Cartellini','Tiri','Eventi','Over','Under','Sì','No','Vittoria 1','Pareggio','Vittoria 2','Doppia chance','Entrambe le squadre segnano','Prima squadra a segnare','Totale cartellini gialli','Totale cartellini rossi','Totale corner','Totale tiri','Tiri in porta','Decisione VAR','Rigore assegnato','Catalogo mercati. Quote e selezioni si attivano solo con dati verificati.'],
 tr:['Diğer marketler','Oran mevcut değil','Goller','Maç sonucu','Kornerler','Kartlar','Şutlar','Maç olayları','Üst','Alt','Evet','Hayır','1 Kazanır','Beraberlik','2 Kazanır','Çifte şans','İki takım da gol atar','İlk golü atan takım','Toplam sarı kart','Toplam kırmızı kart','Toplam korner','Toplam şut','İsabetli şut','VAR kararı','Penaltı verilir','Market kataloğu. Oranlar yalnızca doğrulanmış verilerle etkinleşir.'],
 nl:['Meer markten','Odds niet beschikbaar','Doelpunten','Wedstrijdresultaat','Corners','Kaarten','Schoten','Gebeurtenissen','Meer dan','Minder dan','Ja','Nee','Winst 1','Gelijkspel','Winst 2','Dubbele kans','Beide teams scoren','Eerste team dat scoort','Totaal gele kaarten','Totaal rode kaarten','Totaal corners','Totaal schoten','Schoten op doel','VAR-beslissing','Penalty toegekend','Marktoverzicht. Odds en selecties worden alleen met geverifieerde gegevens geactiveerd.'],
 ru:['Другие рынки','Коэффициенты недоступны','Голы','Исход матча','Угловые','Карточки','Удары','События матча','Больше','Меньше','Да','Нет','Победа 1','Ничья','Победа 2','Двойной шанс','Обе команды забьют','Первая забившая команда','Всего жёлтых карточек','Всего красных карточек','Всего угловых','Всего ударов','Удары в створ','Решение VAR','Назначен пенальти','Каталог рынков. Коэффициенты и выбор станут доступны только после проверки данных.'],
 zh:['更多盘口','暂无赔率','进球','比赛结果','角球','牌数','射门','比赛事件','大于','小于','是','否','主队胜','平局','客队胜','双重机会','双方均进球','首个进球球队','黄牌总数','红牌总数','角球总数','射门总数','射正次数','VAR判罚','判罚点球','盘口目录。只有经过验证的数据才会启用赔率和选择。'],
 ja:['その他のマーケット','オッズなし','ゴール','試合結果','コーナー','カード','シュート','試合イベント','オーバー','アンダー','はい','いいえ','ホーム勝利','引き分け','アウェイ勝利','ダブルチャンス','両チーム得点','先制チーム','イエローカード合計','レッドカード合計','コーナー合計','シュート合計','枠内シュート','VAR判定','PK判定','マーケット一覧。確認済みデータが届いた場合のみオッズと選択が有効になります。'],
 ko:['기타 마켓','배당률 없음','골','경기 결과','코너킥','카드','슈팅','경기 이벤트','오버','언더','예','아니요','홈 승','무승부','원정 승','더블 찬스','양 팀 득점','첫 득점 팀','총 옐로카드','총 레드카드','총 코너킥','총 슈팅','유효 슈팅','VAR 판정','페널티킥 선언','마켓 목록입니다. 검증된 데이터가 있을 때만 배당률과 선택이 활성화됩니다.'],
 id:['Pasar lainnya','Odds tidak tersedia','Gol','Hasil pertandingan','Tendangan sudut','Kartu','Tembakan','Peristiwa pertandingan','Lebih dari','Kurang dari','Ya','Tidak','Menang 1','Seri','Menang 2','Peluang ganda','Kedua tim mencetak gol','Tim pertama mencetak gol','Total kartu kuning','Total kartu merah','Total tendangan sudut','Total tembakan','Tembakan tepat sasaran','Keputusan VAR','Penalti diberikan','Katalog pasar. Odds dan pilihan hanya aktif dengan data terverifikasi.'],
 hi:['अन्य मार्केट','ऑड्स उपलब्ध नहीं','गोल','मैच परिणाम','कॉर्नर','कार्ड','शॉट','मैच घटनाएँ','से अधिक','से कम','हाँ','नहीं','जीत 1','ड्रॉ','जीत 2','डबल चांस','दोनों टीमें स्कोर करेंगी','पहली गोल करने वाली टीम','कुल पीले कार्ड','कुल लाल कार्ड','कुल कॉर्नर','कुल शॉट','लक्ष्य पर शॉट','VAR निर्णय','पेनल्टी दी गई','मार्केट सूची। सत्यापित डेटा मिलने पर ही ऑड्स और चयन सक्रिय होंगे।'],
 ur:['مزید مارکیٹس','اوڈز دستیاب نہیں','گول','میچ کا نتیجہ','کارنرز','کارڈز','شاٹس','میچ کے واقعات','سے زیادہ','سے کم','ہاں','نہیں','جیت 1','برابری','جیت 2','ڈبل چانس','دونوں ٹیمیں گول کریں','پہلا گول کرنے والی ٹیم','کل پیلے کارڈز','کل سرخ کارڈز','کل کارنرز','کل شاٹس','ٹارگٹ پر شاٹس','VAR فیصلہ','پنلٹی دی گئی','مارکیٹس کی فہرست۔ اوڈز اور انتخاب صرف تصدیق شدہ ڈیٹا ملنے پر فعال ہوں گے۔']
}
const lines = ['1.5','2','2.5','3','3.5','4','4.5','5.5','6.5']
const groups = [
 {title:2, items:[{name:2,choices:lines},{name:16, choices:[10,11]},{name:17,choices:[12,14,11]}]},
 {title:3, items:[{name:3,choices:[12,13,14]},{name:15,choices:['1X','X2','12']}]},
 {title:4, items:[{name:20, choices:['7.5','8.5','9.5','10.5','11.5','12.5']}]},
 {title:5, items:[{name:18,choices:['1.5','2.5','3.5','4.5','5.5','6.5']},{name:19,choices:['0.5','1.5']}]},
 {title:6, items:[{name:21,choices:['15.5','18.5','20.5','22.5','24.5','26.5']},{name:22,choices:['5.5','6.5','7.5','8.5','9.5']}]},
 {title:7, items:[{name:23,choices:[10,11]},{name:24,choices:[10,11]}]}
]
export default function MarketCatalog() {
 const { language } = useLanguage()
 const w = words[language] || words.en
 const option = (v: string | number) => typeof v === 'number' ? w[v] : v
 return <section className="market-catalog">
  <header className="market-catalog-top"><div><span>{w[0]}</span><small>{w[1]}</small></div><i>BETNOVA</i></header>
  {groups.map((group,i)=><section className="market-catalog-group" key={group.title}>
   <h4>{w[group.title]}</h4>
   {group.items.map(item=><article className="market-catalog-item" key={item.name}>
    <div className="market-catalog-item-title">{w[item.name]}<span>{w[1]}</span></div>
    {item.choices.length && typeof item.choices[0] === 'string' && item.choices.every(v=>lines.includes(String(v)) || /^\d/.test(String(v))) ?
     <div className="market-line-grid">{item.choices.map(line=><div className="market-line-row" key={line}><b>{line}</b><button disabled>{w[8]} {line}<strong>—</strong></button><button disabled>{w[9]} {line}<strong>—</strong></button></div>)}</div> :
     <div className="market-outcomes">{item.choices.map(v=><button disabled className="market-outcome" key={v}><span>{option(v)}</span><b>—</b></button>)}</div>}
   </article>)}
  </section>)}
  <p className="market-catalog-note">{w[25]}</p>
 </section>
}
