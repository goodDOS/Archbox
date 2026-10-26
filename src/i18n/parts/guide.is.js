export default {
  title: 'Notkunarleiðbeiningar',
  subtitle: '文档盒 Archbox · Eiginleikar vöru og notkunarleiðbeiningar',
  introTitle: 'Yfirlit vöru',
  introP1:
    '文档盒 Archbox er staðbundin og ótengd vinnustöð fyrir skjalastjórnun, ætluð litlum og meðalstórum teymum og einstaklingum. Öll viðskiptagögn eru geymd í einni staðbundinni SQLite skrá, virknin er fullkomin án nettengingar og hægt er að flytja gögnin heildstætt með möppunni.',
  introP2:
    'Þessi hugbúnaður býður ekki upp á skýjageymslu, skýjasamstillingu reikninga, samvinnu á netinu né gervigreindarsamantektir. Öllum leiðum sem gætu orðið til þess að gögn fari út af þessari vél hefur verið lokað: skýjasamstilling er eingöngu frátekið viðmót og er sjálfgefið óvirk.',
  scopeTitle: 'Notkunarsvið',
  scopeYes: 'Notkunarsvið',
  scopeYesBody:
    'Ætlað einstaklingum og litlum teymum sem þurfa langtímageymslu, skipulagða leit og sannanlega rekjanleika í skjalastjórnun: styður tveggja stiga geymslu „svæði → flokkur“, altæka þvermerkingar, sex tegundir sérsniðinna reita, blandaða skráningu texta og mynda (myndir geymdar innfellt í base64), sögulegar útgáfumyndir og heildarendurheimt, leit í öllum texta og leit innan síðu, fulla aðgerðaskráningu byggða á SHA-256 kjötthrunakeðju, auk valkvæðrar AES-256-GCM gagnsærrar dulkóðunar. Tæki á sama neti geta skoðað samnýtt svæði í lesham í gegnum „staðarnetssamnýtingu“.',
  scopeNo: 'Óhentug notkunarsvið',
  scopeNoBody:
    'Þessi hugbúnaður hentar ekki fyrir sameiginlega netvinnslu margra, aðgang í farsíma, birtingu opinberra hlekkja né stjórnun stórra myndaasafna. Útgáfusamanburður nær aðeins yfir texta; breytingar á myndum og uppsetningu eru utan samanburðar. Skýjasamstilling er frátekinn staðgengill í forritinu og ekki útfærð.',
  scopeVerdictLabel: 'Valdómur: ',
  scopeVerdict:
    'Ef kjarnakrafan er „að margir breyti sama skjalinu samtímis á netinu“ hentar þessi hugbúnaður ekki; ef kjarnakrafan er „að mikilvæg skjöl séu geymd örugglega til langs tíma á þessari vél, alltaf opin og nothæf án nets“ hentar hann vel.',
  featuresTitle: 'Eiginleikar',
  f1Title: 'Tveggja stiga geymsla og altæk merki',
  f1Body:
    'Skjölum er raðað í tveggja stiga skipulag „svæði → flokkur“, án þriðja stigs. Merki eru altæk skilgreining, hangandi þvert utan stigveldisins, notuð til að merkja stöðu skjals (t.d. í vinnslu, bíður endurskoðunar, ógilt), án þess að bera merkinguna um tilheyrandi. Bæði svæði og flokkar hafa einstakan kóða, með tvöfaldri vörn: tvítekningsgreiningu í forritslaginu og einstaka vísitölu í gagnagrunninum.',
  f1Limit: 'Takmörkun: geymslustig eru föst í tvö. Notendur sem vanir eru mörgum möppum í stigum þurfa að aðlagast.',
  f2Title: 'Blanduð skráning texta og mynda',
  f2Body:
    'Ritill byggður á Tiptap (ProseMirror) styður málsgreinar, fyrirsagnir, lista, tilvitnanir, aðgreiningarlínur, kóðablokkir, tengla, textalit, jöfnun og leturstærð, og afturköllun/endurtaka er í viðskiptastigi (transaction). Myndir eru settar beint inn í meginmálið í base64, án aðskilinna skráa, þannig að afrit af gagnagrunnsskránni jafngildir fullkomnu afriti af innihaldi með myndum. Innihald er hreinsað með sanitize-html hvítlista og DOMPurify annarri meðhöndlun fyrir geymslu og birtingu.',
  f2Limit:
    'Takmörkun: myndastærð fer beint inn í gagnagrunnsskrána og stærð gagnagrunnsins vex eftir því sem myndum fjölgar.',
  f3Title: 'Sex tegundir sérsniðinna reita',
  f3Body:
    'Styður sex reitategundir: texti, langur texti, tala, dagsetning, fellilisti og hlekkur. Reitaskilgreiningar eru altækar og sameiginlegar; ein skilgreining nægir til endurnotkunar í öllum flokkum án þess að endurtaka uppsetningu fyrir hvern flokk.',
  f3Limit:
    'Takmörkun: reitaskilgreiningar tengjast öllum flokkum; reitir sem ekki eru notaðir í ákveðnum flokkum birtast samt í skráningareyðublaðinu.',
  f4Title: 'Leit í öllum texta og síun',
  f4Body:
    'Leitarorðaleit nær yfir titil, meginmál, reitagildi og höfund, niðurstöður auðkenndar; hægt er að leggja ofan á fjölþætta síun eftir svæði, flokki, merki, höfundi, dagsetningarbili, reitagildi og uppruna. Skjalsíðan styður Ctrl+F leit innan síðu, með skönnunarsvið yfir titil, reitagögn og meginmál.',
  f4Limit: 'Takmörkun: leitarorðaleit passar ekki við heiti merkja; notaðu síu fyrir merki.',
  f5Title: 'Sögulegar útgáfumyndir og endurheimt',
  f5Body:
    'Við hverja vistun myndast sjálfkrafa söguleg útgáfumynd; hægt er að forskoða hvaða sögulegu útgáfu sem er, endurheimta heila útgáfu með einum smelli, eða velja ákveðna útgáfu til hliðarsamanburðar reit fyrir reit við núverandi innihald, með merkingum um viðbætur, eyðingar og breytingar.',
  f5Limit:
    'Takmörkun: aðeins texti er borinn saman; breytingar á myndum og uppsetningu sjást ekki; við hverja vistun myndast útgáfumynd, óháð því hvort innihaldið breyttist í raun.',
  f6Title: 'Gagnsæ dulkóðun og sannanleg skráning',
  f6Body:
    'Hægt er að dulkóða gagnagrunnsskrána með AES-256-GCM, lykilorð dregið með scrypt (N=16384). Lykilaðgerðir skráðar í SHA-256 kjötthrunakeðju (þ.m.t. upphafsblokk), hægt að staðfesta með einum smelli til að sannreyna hvort gögnum hafi verið breytt.',
  f6Limit:
    'Athugið: ① dulkóðun er sjálfgefið óvirk og þarf að virkja handvirkt í „Stillingar → Gagnadulkóðun“; ② lykilorð gagnagrunnsins er óendurheimtanlegt ef það gleymist (engin bakhurð), en lykilorð reiknings má endurstilla með öryggisspurningum; þessi tvö eru óháð.',
  f7Title: 'Sjálfvirk afritun',
  f7Body:
    'Styður daglega eða vikulega afritun gagnagrunns í tiltekna möppu, og má stilla afritun við útgöngu. Afritunarskrár halda nýjustu 5 afritunum og eldri afritum er snúið sjálfkrafa.',
  f7Limit: 'Athugið: sjálfvirk afritun er sjálfgefið óvirk; mælt er með að virkja hana við fyrstu uppsetningu.',
  f8Title: 'Lesaðgangur innan sama nets',
  f8Body:
    'Tæki á sama neti sem setja upp hugbúnaðinn og fara í „staðarnetssamnýtingu“ finna sjálfkrafa samnýtingaruppsprettur (boðmerki sent á 5 sekúndna fresti, engin þörf á handvirkri afhendingu heimilisfangs; ef listinn sýnir ekki mótaðilann má smella á „endurfinna“ til að finna handvirkt). Samnýtt innihald er lesaðgangur og styður leit og leit innan síðu. Drög, sniðmát og efni ruslatunnu taka ekki þátt í samnýtingu.',
  f8Limit:
    'Takmörkun: samnýting er lesaðgangur, mótaðili getur ekki breytt gögnum þessarar vélar; sjálfgefið má mótaðili ekki afrita skjöl, þarf að virkja „leyfa afritun til baka á þessa vél“ í „mín samnýting“. Samnýtingarþjónustan býður ekki upp á vefviðmót; bein aðgangur vafra að heimilisfanginu sýnir aðeins skýringarsíðu.',
  f9Title: 'Flutningur einnar skráar',
  f9Body:
    'Styður útflutning skjalapakka á .archboxpack sniði (ZIP uppbygging með skrá, eftirlitssummu og undirskrift), pökkunarsvið nær yfir meginmál, myndir, reiti, merki, svæði og flokka. Við innflutning er tvítekning metin eftir titli, svæði og flokki, með fjórum aðferðum: sleppa, sameina, nýtt og engin tvítekningsgreining.',
  f9Limit: 'Takmörkun: stærð skjalapakka vex með innfelldum myndum; staðfestu stærð fyrir flutning.',
  f10Title: 'Átta útlitþemu',
  f10Body:
    'Innbyggð sex litþemu: viðskiptaljóst, viðskiptadökkt, svart-hvítt lína, bambusgrænt, sandelbrúnt, himinblátt, auk tveggja heiðursþema CS1.6 og Half-Life; smelltu til að skipta.',
  f10Limit: 'Takmörkun: styður ekki sjálfvirka skiptingu eftir ljósu/dökku kerfisþema; þarf að velja handvirkt.',
  passwordTitle: 'Reikningslykilorð og gagnagrunnslykilorð',
  pwAccount: 'Reikningslykilorð',
  pwAccountBody:
    'Skilríki til innskráningar í hugbúnaðinn. Ef það gleymist má endurstilla lykilorðið beint með þremur öryggisspurningum sem settar voru við skráningu. Gakktu úr skugga um að öryggisspurningarnar hafi verið fylltar rétt út og svörin séu munað.',
  pwDb: 'Gagnagrunnslykilorð',
  pwDbBody:
    'Sjálfstæð skilríki til dulkóðunar gagnagrunnsins. Lykilorðið er ekki geymt í hreinum texta, lykillinn dreginn úr því með scrypt, án bakhurðar og handvirkrar endurheimtarleiðar; ef það gleymist verður gagnagrunnurinn óopnanlegur að eilífu. Þetta lykilorð er aðeins notað eftir að dulkóðun hefur verið virkjuð; án dulkóðunar kemur það ekki við sögu.',
  pwNote:
    'Þessi hugbúnaður setur ekki upp leiðsögn við fyrstu ræsingu. Eftir uppsetningu er fyrsta opnun innskráningar-/skráningarsíða; kláraðu einfaldlega reikningsskráningu til að fara inn á aðalviðmótið.',
  startTitle: 'Leiðbeiningar við fyrstu notkun',
  s1: 'Skráðu reikning. Fyrsta opnun er innskráningarsíða; við skráningu þarf að fylla út notendanafn, lykilorð og þrjár öryggisspurningar (til að endurheimta lykilorð), án leiðsagnar.',
  s2: 'Staðfestu þörf fyrir dulkóðun. Hægt er að nota hugbúnaðinn án dulkóðunar; ef dulkóðun er óskað skaltu virkja hana í „Stillingar → Gagnadulkóðun“ og geyma gagnagrunnslykilorðið vel. Sá valkostur er sjálfgefið óvirkur.',
  s3: 'Búðu til fyrsta svæðið og stilltu kóða. Kóði er skyldureitur og einstakur í öllum gagnagrunninum (t.d. HR, FIN) og notaður í skjalanúmer og skjalapakkaútflutning; fylltu hann út samkvæmt reglum.',
  s4: 'Búðu til flokka undir svæðinu. Flokkakóði þarf einnig að vera einstakur. Þar með er geymslugrindin tilbúin; hafðu í huga að stigveldið er fast í tvö stig.',
  s5: 'Skipulagðu merkjakerfi. Merki eru altæk; mælt er með að nefna þau eftir stigi skjalsins frekar en tilheyrandi.',
  s6: 'Skilgreindu nauðsynlega reiti. Farðu í „Samstæðustjórnun“ og búðu til reitaskilgreiningar eftir þörfum, svo sem samningsnúmer, undirritunardagsetningu og fjárhæð, altækt endurnýtanlegar.',
  s7: 'Skráðu fyrsta skjalið. Smelltu á „Nýtt“ undir svæði eða flokki, fylltu út titil, settu upp meginmál, settu inn myndir og fylltu út reiti. Við vistun myndast söguleg útgáfumynd samtímis.',
  s8: 'Kynntu þér tvær leitaraðferðir. Leitarreiturinn efst styður leitarorðaleit og ofanálagðar síur; til að staðsetja innan langs skjals má nota Ctrl+F leit innan síðu á skjalsíðunni.',
  s9: 'Virkjaðu sjálfvirka afritun. Farðu í „Stillingar → Gögn“ og virkjaðu sjálfvirka afritun og tilgreindu möppu. Sá valkostur er sjálfgefið óvirkur; mælt er með að stilla hann sem fyrst.',
  s10: 'Virkjaðu staðarnetssamnýtingu eftir þörfum. Farðu í „Staðarnetssamnýtingu“, kveiktu á rofanum og hakaðu við marksvæðin. Tæki á sama neti finna þessa vél sjálfkrafa; aðgangslykill er sjálfgefið virkur, mótaðili þarf að slá lykilinn inn einu sinni til að fá lesaðgang; ef „tenging krefst aðgangslykils“ er óvirk er hægt að tengjast með einum smelli, en þá getur hvaða tæki sem er á sama neti tengst, veldu því með varúð.',
  tamperTitle: 'Skýring á verndun heilleika forrits',
  tamperIntro:
    'Þessi hugbúnaður framkvæmir tveggja laga athugun á því hvort forritaskrám hafi verið breytt; kveikjuskilyrði og meðhöndlun laganna tveggja eru ólík, athugaðu muninn:',
  tamperLayer1: 'Aðallag',
  tamperLayer1Body:
    'Forritakóði (viðmót, viðskiptarökvísi og ræsiforrit) er pakkaður inni í resources\\app.asar, fingrafar hans skrifað inn í keyrsluskrána Archbox.exe sjálfa og staðfest af Electron keyrsluumhverfinu á allra fyrsta stigi ræsingar, áður en nokkur viðskiptakóði keyrir, þannig að þessi hugbúnaður getur ekki stöðvað né tilkynnt það. Ef staðfestingin mistekst birtist enginn gluggi eftir tvísmell og ferlið hættir beint. Þetta er vísvitandi hörð bilun í þessu lagi; „enginn gluggi, hraður útgöngubrestur“ er merki um að aðalforritinu hafi verið breytt.',
  tamperLayer2: 'Meðfylgjandi lag',
  tamperLayer2Body:
    'Fáar skrár sem ekki er hægt að pakka inn í safnið (t.d. WebAssembly eining gagnagrunnskerfisins) eru í resources\\app.asar.unpacked og hugbúnaðurinn ber þær saman við undirritunarskrá við hverja ræsingu. Þegar munur finnst: ① birtist viðvarandi viðvörunarstika efst í viðmóti (fellanleg); ② skráð í skráningarsögu, ein færsla við hverja ræsingu og ekki hægt að hreinsa sjálfkrafa; ③ birtar nákvæmar upplýsingar um skráarnafn, upphaflegt kjötthrun og núverandi kjötthrun. Þetta lag hefur ekki áhrif á skrifheimildir; skrifanleiki gagna er metinn sjálfstætt með „heilleika gagnaskráa“, og þessar tvær athuganir eru vísvitandi aðskildar.',
  tamperNote:
    'Getumörk: aðallagið er tryggt innan keyrsluskrárinnar; eftir breytingu getur forritið ekki ræst. Meðfylgjandi lagið veitir ummerki um breytingar frekar en algera vörn, og getur varið gegn óviljandi breytingum, þöglum breytingum öryggishugbúnaðar og rangri endurnýjun. Ef bæði skrá og undirritunarskrá eru breytt samtímis er í orði hægt að komast framhjá, en þá skilur eftir sig ummerki í skráningarkeðjunni.',
  crashTitle: 'Vandræðaleit við ræsingu',
  c1: 'Greindu fyrst einkenni bilunarinnar. Ef enginn gluggi er og ferlið hverfur í einu, sjá skref 2; ef gluggi er en skilaboð birtast í viðmóti, fylgdu meðhöndlunarleiðinni í skilaboðunum.',
  c2: '„Enginn gluggi, hraður útgöngubrestur“ merkir að aðalforritinu hafi verið breytt eða skrá skemmd. Algengasta orsökin er að öryggishugbúnaður hafi einangrað, eytt eða breytt Archbox.exe eða app.asar, en einnig getur verið um ófullkomna uppsetningu eða skrifvillu á diski að ræða.',
  c3: 'Meðhöndlunin er enduruppsetning. Fáðu forritapakkann frá opinberri uppsprettu og settu upp yfir á sama stað; gögn eru ekki geymd í forritamöppunni, þannig að yfirsetning hefur ekki áhrif á gögn. Ef öryggishugbúnaður stöðvar ítrekað, bættu forritamöppunni við traustan lista áður en þú setur upp aftur.',
  c4: 'Hvers vegna birtist engin tilkynning í þessu lagi: staðfestingin keyrir áður en viðskiptakóði keyrir og er innri hegðun keyrsluskrárinnar; þessi hugbúnaður hefur ekkert tækifæri til að birta tilkynningu. Þessi skýringarsíða er sú tilkynning sem á við.',
  c5: 'Staðsetning skráa: þegar forritið ræsir eðlilega er skráð í {dir}, skráarnafn af gerðinni app-2026-10-17.log, snúið daglega og haldið í 7 daga (hægt er að afrita heildarslóðina að ofan, eða smella á „opna skrámöppu“ í „Stillingar → Keyrsluskrár“). Athugið: skrámappan er á sama stigi og gagnamappan, ekki inni í henni. Fyrstu línur ræsingar innihalda færsluna „forritaskrár sjálfskoðun samþykkt / óvirk / ekki samþykkt“, sem tilheyrir niðurstöðu meðfylgjandi lags.',
  unfitTitle: 'Óhentug tilvik',
  unfitLead: 'Við eftirfarandi tilvik er mælt með að velja önnur tól:',
  u1: 'Þegar margir þurfa að breyta sama skjalinu samtímis. Þessi hugbúnaður er vinnustöð fyrir einn notanda; lesaðgangur er hámarksgeta, engin rauntíma samvinna.',
  u2: 'Þegar þarf að skoða í síma eða spjaldtölvu hvenær sem er. Þessi hugbúnaður er skrifborðsforrit; staðarnetssamnýting er ætluð tölvum með sama hugbúnað, ekki vefsíða, og býður ekki upp á farsímaútgáfu.',
  u3: 'Þegar þarf að búa til opinn hlekk út á við. Samnýtingarsvið er takmarkað við sama net og hægt að loka hvenær sem er; hentar ekki til opinberrar birtingar.',
  u4: 'Þegar þarf að stjórna tugþúsundum mynda. Myndir eru geymdar innfellt og gagnagrunnurinn vex stöðugt; mælt er með sérhæfðu efnastjórnunartóli.',
  u5: 'Þegar teymið getur ekki sætt sig við að gögn séu aðeins geymd á einu tæki. Þetta er hönnunarforsenda hugbúnaðarins, án millivegar.',
  coda: 'Ef skjöl þurfa að vera geymd stöðugt til langs tíma á þessari vél, alltaf opin og óháð neti, er þessi hugbúnaður viðeigandi val fyrir það tilvik.',
  tail: 'Innihald þessarar síðu uppfærist með útgáfum. Keyrsluumhverfi, opinn hugbúnaður og leyfisskilmálar má sjá á „Um“ síðunni. Núverandi er prófunarútgáfa og virkni og skýringartexti geta haldið áfram að breytast.'
};
