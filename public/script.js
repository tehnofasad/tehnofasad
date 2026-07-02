const modal = document.querySelector("#offer-modal");
const openButtons = document.querySelectorAll("[data-open-form]");
const closeButtons = document.querySelectorAll("[data-close-form]");
const leadForms = document.querySelectorAll("[data-lead-form]");
const langButtons = document.querySelectorAll("[data-lang]");
const navToggle = document.querySelector(".nav-toggle");
const mainNav = document.querySelector(".main-nav");
const aiChat = document.querySelector("#ai-chat");
const aiChatToggle = document.querySelector(".ai-chat__toggle");
const aiChatClose = document.querySelector(".ai-chat__close");
const aiChatPanel = document.querySelector(".ai-chat__panel");
const aiChannelMenu = document.querySelector(".ai-chat__channel-menu");
const aiChannelChat = document.querySelector("[data-ai-channel='chat']");
const aiChatMessages = document.querySelector(".ai-chat__messages");
const aiChatForm = document.querySelector(".ai-chat__form");
const aiQuickButtons = document.querySelectorAll("[data-ai-prompt]");
const aiLeadForm = document.querySelector("[data-ai-lead-form]");
const aiLeadButton = document.querySelector("[data-ai-action='lead']");
const aiResetButton = document.querySelector("[data-ai-reset]");
const aiChatHistory = [];
let accumulatedLead = {};

const i18n = {
  ro: {
    "nav.about": "Despre noi",
    "nav.products": "Produse",
    "nav.prodMetalRoof": "Tigla metalica",
    "nav.prodSandwich": "Panouri sandwich",
    "nav.prodRoofing": "Materiale pentru acoperis",
    "nav.prodSheet": "Tabla profilata",
    "nav.prodDrainage": "Sisteme pluviale",
    "nav.prodAcc": "Accesorii acoperis",
    "nav.calculator": "Calculator",
    "nav.portfolio": "Portofoliu",
    "nav.reviews": "Recenzii",
    "nav.contacts": "Filiale",
    "common.offer": "Oferta",
    "common.callNow": "Suna acum",
    "hero.kicker": "Panouri sandwich / depozit in Balti",
    "hero.title": "Panouri sandwich in stoc pentru pereti si acoperis",
    "hero.text": "Spui tipul panoului, grosimea si cantitatea. Verificam disponibilitatea, calculam pretul si rezervam materialul pentru ridicare din depozit sau livrare.",
    "hero.badge1": "Stoc in Balti",
    "hero.badge2": "Oferta dupa cantitate",
    "hero.badge3": "Consultatie tehnica",
    "hero.cta": "Cere oferta gratuita",
    "hero.calc": "Calculeaza cererea",
    "hero.fact1Title": "Stoc local",
    "hero.fact1Text": "material disponibil in Balti",
    "hero.fact2Title": "Oferta rapida",
    "hero.fact2Text": "pret dupa parametri reali",
    "hero.fact3Title": "Rezervare",
    "hero.fact3Text": "dupa confirmarea cantitatii",
    "quick.title": "Ai nevoie de pret?",
    "quick.text": "Trimite cantitatea aproximativa si revenim cu disponibilitatea.",
    "form.name": "Nume",
    "form.quantity": "Cantitate, ex. 250 m2",
    "form.submit": "Trimite cererea",
    "reviews.kicker": "Recenzii",
    "reviews.title": "Ce spun clientii care au comandat materiale",
    "reviews.text": "Oamenii ne aleg cand au nevoie de raspuns concret, stoc verificat si material pregatit fara amanari inutile.",
    "reviews.card1.text": "\"Aveam nevoie urgent de panouri pentru o hala mica. Am trimis dimensiunile, iar in aceeasi zi mi-au spus ce este in stoc si cat costa. Am ridicat marfa fara pierdere de timp.\"",
    "reviews.card1.name": "Sergiu Munteanu",
    "reviews.card1.role": "Proprietar atelier, Balti",
    "reviews.card2.text": "\"Mi-au explicat diferenta dintre grosimi si ce varianta are sens pentru depozitul meu. Nu au impins cel mai scump produs, ci au calculat normal dupa proiect si buget.\"",
    "reviews.card2.name": "Alexandru Cebotari",
    "reviews.card2.role": "Client pentru depozit agricol",
    "reviews.card3.text": "\"Am sunat pentru tabla profilata si accesorii. Mi-au facut lista completa, inclusiv elementele pe care le-as fi uitat. Asta m-a ajutat sa nu opresc montajul dupa prima zi.\"",
    "reviews.card3.name": "Vadim Istrati",
    "reviews.card3.role": "Constructor privat",
    "reviews.card4.text": "\"Pentru magazinul nostru aveam termen scurt si nu puteam astepta comanda speciala. Au verificat lotul din Balti, au rezervat cantitatea si am primit totul conform intelegerii.\"",
    "reviews.card4.name": "Irina Balan",
    "reviews.card4.role": "Administrator spatiu comercial",
    "reviews.card5.text": "\"Am cerut pret pentru acoperis si am primit raspuns pe inteles: ce material se potriveste, ce accesorii intra in calcul si unde pot economisi fara sa stric lucrarea.\"",
    "reviews.card5.name": "Mihai Cazacu",
    "reviews.card5.role": "Renovare casa, Singerei",
    "reviews.card6.text": "\"Am revenit cu a doua comanda pentru ca prima livrare a fost corecta. Conteaza mult cand ti se spune din start ce este disponibil si nu trebuie sa suni de cinci ori.\"",
    "reviews.card6.name": "Dumitru Moraru",
    "reviews.card6.role": "Antreprenor constructii",
    sending: "Se trimite...",
    sent: "Cererea a fost trimisa. Va contactam in curand.",
    invalidPhone: "Introduceti un numar de telefon valid.",
    failed: "Nu s-a putut trimite cererea. Sunati la +373(791)55791.",
  },
  ru: {
    "nav.about": "О нас",
    "nav.products": "Продукция",
    "nav.prodMetalRoof": "Металлочерепица",
    "nav.prodSandwich": "Сэндвич-панели",
    "nav.prodRoofing": "Кровельные материалы",
    "nav.prodSheet": "Профнастил",
    "nav.prodDrainage": "Водосточные системы",
    "nav.prodAcc": "Комплектующие",
    "nav.calculator": "\u0420\u0430\u0441\u0447\u0435\u0442",
    "nav.portfolio": "Портфолио",
    "nav.reviews": "Отзывы",
    "nav.contacts": "Филиалы",
    "common.offer": "Заявка",
    "common.callNow": "Позвонить",
    "hero.kicker": "Сэндвич-панели / склад в Бельцах",
    "hero.title": "Сэндвич-панели в наличии для стен и кровли",
    "hero.text": "Укажите тип панели, толщину и количество. Мы проверим наличие, рассчитаем цену и зарезервируем материал для самовывоза со склада или доставки.",
    "hero.badge1": "Склад в Бельцах",
    "hero.badge2": "Цена по количеству",
    "hero.badge3": "Техническая консультация",
    "hero.cta": "Получить предложение",
    "hero.calc": "Рассчитать заявку",
    "hero.fact1Title": "Локальный склад",
    "hero.fact1Text": "материал в наличии в Бельцах",
    "hero.fact2Title": "Быстрое предложение",
    "hero.fact2Text": "цена по реальным параметрам",
    "hero.fact3Title": "Резерв",
    "hero.fact3Text": "после подтверждения количества",
    "quick.title": "Нужна цена?",
    "quick.text": "Отправьте примерное количество, и мы вернемся с наличием.",
    "form.name": "Имя",
    "form.quantity": "Количество, напр. 250 м2",
    "form.submit": "Отправить заявку",
    "reviews.kicker": "Отзывы",
    "reviews.title": "Что говорят клиенты, которые уже заказали материалы",
    "reviews.text": "К нам обращаются, когда нужен конкретный ответ, проверенное наличие и материал без лишних задержек.",
    "reviews.card1.text": "\"Нужно было срочно закрыть небольшую производственную постройку. Отправил размеры, в тот же день получил наличие и цену. Материал забрал со склада без потери времени.\"",
    "reviews.card1.name": "Сергей Мунтяну",
    "reviews.card1.role": "Владелец мастерской, Бельцы",
    "reviews.card2.text": "\"Мне нормально объяснили разницу по толщине и какую панель лучше брать для моего склада. Не пытались продать самое дорогое, а посчитали по задаче и бюджету.\"",
    "reviews.card2.name": "Александр Чеботарь",
    "reviews.card2.role": "Клиент для сельхозсклада",
    "reviews.card3.text": "\"Звонил по профнастилу и комплектующим. Мне собрали полный список, включая детали, которые я сам бы не учел. Благодаря этому монтаж не остановился после первого дня.\"",
    "reviews.card3.name": "Вадим Истрати",
    "reviews.card3.role": "Частный строитель",
    "reviews.card4.text": "\"Для нашего магазина сроки были короткие, ждать спецзаказ не могли. Проверили партию в Бельцах, зарезервировали количество, и мы получили материал как договорились.\"",
    "reviews.card4.name": "Ирина Балан",
    "reviews.card4.role": "Администратор коммерческого помещения",
    "reviews.card5.text": "\"Запросил цену для кровли и получил понятный ответ: какой материал подходит, какие аксессуары нужны и где можно сэкономить без ущерба для работы.\"",
    "reviews.card5.name": "Михаил Казаку",
    "reviews.card5.role": "Ремонт дома, Сынжерей",
    "reviews.card6.text": "\"Вернулся со вторым заказом, потому что первая поставка прошла корректно. Важно, когда сразу говорят, что есть в наличии, и не приходится звонить пять раз.\"",
    "reviews.card6.name": "Дмитрий Морару",
    "reviews.card6.role": "Подрядчик по строительству",
    sending: "Отправляем...",
    sent: "Заявка отправлена. Мы скоро свяжемся с вами.",
    invalidPhone: "Введите корректный номер телефона.",
    failed: "Не удалось отправить заявку. Позвоните на +373(791)55791.",
  },
};

const phraseRu = {
  "mun. Balti, str. Lev Dovator 1": "мун. Бельцы, ул. Лев Доватор 1",
  "Cere oferta": "Получить цену",
  "Balti": "Бельцы",
  "Balti (piata Tvoy Dom)": "Бельцы (рынок Твой Дом)",
  "Consultatie, comenzi si ridicare materiale": "Консультация, заказы и самовывоз материалов",
  "mun. Balti, str. Locomotivelor, 4": "мун. Бельцы, ул. Locomotivelor, 4",
  "Programul se confirma la apel": "График уточняется по телефону",
  "Tvoy Dom": "Твой Дом",
  "Balti Tvoy Dom": "Бельцы Твой Дом",
  "depozit si ridicare locala": "склад и самовывоз",
  "Perete": "Стены",
  "panouri pentru hale si depozite": "панели для ангаров и складов",
  "Acoperis": "Кровля",
  "panouri pentru inchideri rapide": "панели для быстрого монтажа",
  "Oferta": "Предложение",
  "calcul dupa stoc si cantitate": "расчет по складу и количеству",
  "Produse": "Продукция",
  "Gama principala pentru constructii comerciale si industriale": "Основная продукция для коммерческих и промышленных объектов",
  "Clientul vede imediat ce poate comanda, ce date trebuie sa trimita si cum ajunge la oferta. Accentul ramane pe disponibilitate si raspuns rapid.": "Клиент сразу видит, что можно заказать, какие данные отправить и как получить предложение. Акцент на наличии и быстром ответе.",
  "Panouri sandwich": "Сэндвич-панели",
  "Categoria principala pentru inchideri rapide, izolatie eficienta si proiecte industriale.": "Основная категория для быстрого монтажа, эффективной изоляции и промышленных проектов.",
  "Panouri sandwich de perete": "Стеновые сэндвич-панели",
  "Pentru hale, depozite, spatii comerciale, camere frigorifice, anexe si constructii tehnice.": "Для ангаров, складов, коммерческих помещений, холодильных камер, пристроек и технических объектов.",
  "Panouri sandwich de acoperis": "Кровельные сэндвич-панели",
  "Pentru acoperisuri industriale si comerciale, cu montaj rapid si izolatie eficienta.": "Для промышленных и коммерческих кровель с быстрым монтажом и эффективной изоляцией.",
  "Elemente si accesorii": "Элементы и аксессуары",
  "Profile, elemente de inchidere, fixare si consultatie pentru completarea comenzii.": "Профили, элементы закрытия, крепеж и консультация для комплектации заказа.",
  "Tigla metalica": "Металлочерепица",
  "Solutie pentru acoperisuri rezidentiale si comerciale, cu profil metalic durabil.": "Решение для жилых и коммерческих крыш с прочным металлическим профилем.",
  "Tigla metalica modulara": "Модульная металлочерепица",
  "Module usor de transportat si montat, potrivite pentru acoperisuri cu geometrie variata.": "Модули удобно перевозить и монтировать, подходят для крыш со сложной геометрией.",
  "Tabla profilata": "Профнастил",
  "Pentru acoperisuri, garduri, fatade si inchideri tehnice cu montaj eficient.": "Для кровель, заборов, фасадов и технических ограждений с быстрым монтажом.",
  "Sisteme pluviale": "Водосточная система",
  "Jgheaburi, burlane si elemente pentru evacuarea corecta a apei de pe acoperis.": "Желоба, трубы и элементы для правильного отвода воды с крыши.",
  "Accesorii pentru acoperis": "Кровельные аксессуары",
  "Coame, sorturi, dolii, elemente de margine, fixare si completare pentru montaj.": "Коньки, планки, ендовы, торцевые элементы, крепеж и комплектующие для монтажа.",
  "Solicita pret": "Запросить цену",
  "Despre noi": "О нас",
  "TEHNOFASAD lucreaza cu clienti care au nevoie de material clar, rapid si calculat corect": "TEHNOFASAD работает с клиентами, которым нужен понятный материал, быстрый ответ и корректный расчет",
  "Suntem concentrati pe panouri sandwich pentru proiecte comerciale, industriale si agricole. Rolul nostru este sa reducem timpul dintre cerere si material: verificam disponibilitatea, explicam variantele si pregatim oferta dupa parametrii reali ai comenzii.": "Мы сосредоточены на сэндвич-панелях для коммерческих, промышленных и сельскохозяйственных проектов. Наша задача - сократить путь от заявки до материала: проверяем наличие, объясняем варианты и готовим предложение по реальным параметрам заказа.",
  "Depozit local": "Локальный склад",
  "Balti, str. Lev Dovator 1": "Бельцы, ул. Лев Доватор 1",
  "Focus pe panouri": "Фокус на панелях",
  "perete, acoperis si accesorii": "стены, кровля и аксессуары",
  "Oferta practica": "Практичное предложение",
  "calcul dupa grosime, cantitate si stoc": "расчет по толщине, количеству и складу",
  "Productie si produse": "Производство и продукция",
  "Parametrii pe care ii discutam inainte de rezervare": "Параметры, которые мы уточняем перед резервом",
  "Destinatie": "Назначение",
  "Pereti exteriori, compartimentari, acoperisuri, depozite si hale.": "Наружные стены, перегородки, кровля, склады и ангары.",
  "Grosime": "Толщина",
  "Alegerea grosimii depinde de izolatie, destinatie si buget.": "Выбор толщины зависит от теплоизоляции, назначения и бюджета.",
  "Cantitate": "Количество",
  "Calculam oferta dupa m2 si disponibilitatea lotului.": "Рассчитываем предложение по м2 и наличию партии.",
  "Culoare si profil": "Цвет и профиль",
  "Confirmam variantele disponibile in stoc la momentul cererii.": "Подтверждаем варианты, доступные на складе в момент заявки.",
  "Stoc si parametri": "Склад и параметры",
  "Ce date ne ajuta sa calculam corect oferta": "Какие данные помогают корректно рассчитать предложение",
  "Pretul final depinde de tipul panoului, grosime, cantitate si disponibilitatea lotului. De aceea cererea este scurta, dar orientata pe informatia care conteaza.": "Финальная цена зависит от типа панели, толщины, количества и наличия партии. Поэтому заявка короткая, но содержит важные данные.",
  "Tip panou": "Тип панели",
  "perete / acoperis": "стена / кровля",
  "40-100 mm sau alta": "40-100 мм или другая",
  "m2 aproximativ": "примерно м2",
  "Logistica": "Логистика",
  "ridicare / livrare": "самовывоз / доставка",
  "Calculator cerere": "Расчет заявки",
  "Configurator cerere": "Конфигуратор заявки",
  "Configureaza rapid materialul si trimite datele pentru oferta": "Быстро настройте материал и отправьте данные для предложения",
  "Pentru TEHNOFASAD configuratorul este orientat pe decizie rapida: alegi categoria, grosimea, cantitatea si logistica. Specialistul verifica stocul si pregateste oferta pe scenariul real al comenzii.": "Для TEHNOFASAD конфигуратор ориентирован на быстрое решение: выбираете категорию, толщину, количество и логистику. Специалист проверяет склад и готовит предложение по реальному сценарию заказа.",
  "Alegi materialul": "Выбираете материал",
  "Panouri sandwich, tigla, tabla profilata sau sistem pluvial.": "Сэндвич-панели, черепица, профнастил или водосточная система.",
  "Adaugi parametrii": "Добавляете параметры",
  "Grosime, cantitate, localitate si observatii utile.": "Толщина, количество, населенный пункт и полезные комментарии.",
  "Primim cererea": "Получаем заявку",
  "Revenim cu disponibilitatea si oferta potrivita.": "Возвращаемся с наличием и подходящим предложением.",
  "Material": "Материал",
  "Alege materialul": "Выберите материал",
  "Sistem pluvial": "Водосточная система",
  "Trimite parametrii panoului si primesti oferta": "Отправьте параметры панели и получите предложение",
  "In loc de configurator complex, pentru TEHNOFASAD este mai util un formular scurt: tip panou, grosime, cantitate si localitate. Specialistul poate calcula pretul mai corect dupa stocul real.": "Вместо сложного конфигуратора для TEHNOFASAD полезнее короткая форма: тип панели, толщина, количество и населенный пункт. Специалист точнее рассчитает цену по реальному складу.",
  "alegere tip panou: perete sau acoperis": "выбор типа панели: стена или кровля",
  "grosime si cantitate aproximativa": "толщина и примерное количество",
  "localitate pentru ridicare sau livrare": "населенный пункт для самовывоза или доставки",
  "Alege tipul": "Выберите тип",
  "Panou de perete": "Стеновая панель",
  "Panou de acoperis": "Кровельная панель",
  "Nu stiu, am nevoie de consultatie": "Не знаю, нужна консультация",
  "Alege grosimea": "Выберите толщину",
  "Alta grosime": "Другая толщина",
  "Localitate": "Населенный пункт",
  "Telefon": "Телефон",
  "Cere estimarea": "Получить расчет",
  "Calculator 3D pentru acoperis": "3D-конструктор крыши",
  "Modeleaza acoperisul si estimeaza suprafata materialului": "Смоделируйте крышу и оцените площадь материала",
  "Alege forma casei, ajusteaza volumetria, selecteaza materialul si activeaza scurgerea. Configuratorul estimeaza suprafata si trimite datele specialistului.": "Выберите форму дома, настройте размеры, выберите материал и водосток. Конструктор рассчитает площадь и отправит данные специалисту.",
  "Suprafata acoperis": "Площадь крыши",
  "Cu rezerva": "С запасом",
  "Unghi aproximativ": "Примерный угол",
  "Scurgere, ml": "Водосток, пог. м",
  "1. Forma acoperisului": "1. Форма крыши",
  "Casa simpla - 2 pante": "Простой дом - 2 ската",
  "Casa simpla - 4 pante": "Простой дом - 4 ската",
  "Casa in L": "Дом в форме L",
  "Casa in T": "Дом в форме T",
  "Continuă": "Продолжить",
  "2. Ajustează Volumetria": "2. Настройте объем",
  "Lungime corp principal": "Длина основного корпуса",
  "Latime corp principal": "Ширина основного корпуса",
  "Lungime aripa": "Длина крыла",
  "Latime aripa": "Ширина крыла",
  "Inaltime coama": "Высота конька",
  "Streasina": "Свес крыши",
  "Rezerva material": "Запас материала",
  "3. Materialul": "3. Материал",
  "Panouri sandwich acoperis": "Кровельные сэндвич-панели",
  "4. Sistem de scurgere": "4. Водосточная система",
  "Pana ce nu": "Пока нет",
  "Sandrama / streasina": "Карниз / свес",
  "Sandrama + scurgere": "Карниз + водосток",
  "Trimite calculul": "Отправить расчет",
  "De ce TEHNOFASAD": "Почему TEHNOFASAD",
  "Avantaje clare pentru cei care au nevoie de material rapid": "Понятные преимущества для тех, кому материал нужен быстро",
  "Stoc in Balti": "Склад в Бельцах",
  "Verificam disponibilitatea si rezervam cantitatea necesara pentru client.": "Проверяем наличие и резервируем нужное количество для клиента.",
  "Consultatie tehnica": "Техническая консультация",
  "Te ajutam sa alegi panoul potrivit dupa destinatie, grosime si cantitate.": "Помогаем выбрать подходящую панель по назначению, толщине и количеству.",
  "Oferta transparenta": "Прозрачное предложение",
  "Calculam pretul dupa parametri reali, nu dupa promisiuni generale.": "Считаем цену по реальным параметрам, а не по общим обещаниям.",
  "Ridicare rapida": "Быстрый самовывоз",
  "Adresa depozitului este clara: mun. Balti, str. Lev Dovator 1.": "Адрес склада понятен: мун. Бельцы, ул. Лев Доватор 1.",
  "Portofoliu": "Портфолио",
  "Tipuri de proiecte pentru care livram materiale": "Типы проектов, для которых мы поставляем материалы",
  "Prezentam categoriile principale de lucrari pentru care clientii solicita panouri si materiale de acoperis. Imaginile reale pot fi adaugate ulterior cand alegem portofoliul final.": "Показываем основные категории работ, для которых клиенты запрашивают панели и кровельные материалы. Реальные изображения можно добавить позже, когда выберем финальное портфолио.",
  "Toate": "Все",
  "Acoperisuri": "Кровли",
  "Hale": "Ангары",
  "Depozite": "Склады",
  "Hale si spatii industriale": "Ангары и промышленные помещения",
  "Panouri sandwich pentru inchideri rapide, izolatie si aspect curat.": "Сэндвич-панели для быстрого закрытия, изоляции и аккуратного вида.",
  "Acoperisuri comerciale": "Коммерческие кровли",
  "Tigla metalica, tabla profilata si accesorii pentru lucrari complete.": "Металлочерепица, профнастил и аксессуары для комплексных работ.",
  "Depozite si constructii agricole": "Склады и сельскохозяйственные здания",
  "Materiale rezistente pentru proiecte unde conteaza termenul si bugetul.": "Прочные материалы для проектов, где важны срок и бюджет.",
  "Cum lucram": "Как мы работаем",
  "De la cerere la rezervarea panourilor": "От заявки до резерва панелей",
  "Trimiti datele": "Отправляете данные",
  "Tip panou, grosime, cantitate si telefon.": "Тип панели, толщина, количество и телефон.",
  "Verificam stocul": "Проверяем склад",
  "Confirmam disponibilitatea in depozit.": "Подтверждаем наличие на складе.",
  "Calculam oferta": "Считаем предложение",
  "Pregatim pretul dupa cantitate si parametri.": "Готовим цену по количеству и параметрам.",
  "Rezervi materialul": "Резервируете материал",
  "Stabilim ridicarea sau urmatorul pas logistic.": "Согласуем самовывоз или следующий логистический шаг.",
  "Recenzii": "Отзывы",
  "Ce vrem sa simta clientul dupa prima discutie": "Что клиент должен почувствовать после первого разговора",
  "Pana adaugam recenzii reale, folosim aceste mesaje ca directie de comunicare: claritate, raspuns rapid si oferta concreta.": "Пока реальные отзывы не добавлены, используем эти сообщения как направление коммуникации: ясность, быстрый ответ и конкретное предложение.",
  "Raspuns rapid": "Быстрый ответ",
  "\"Am primit repede confirmarea pentru cantitate si am stiut exact ce urmeaza.\"": "\"Мы быстро получили подтверждение по количеству и понимали следующий шаг.\"",
  "Calcul clar": "Понятный расчет",
  "\"Oferta a fost explicata pe grosime, cantitate si disponibilitate, fara confuzie.\"": "\"Предложение объяснили по толщине, количеству и наличию, без путаницы.\"",
  "Ridicare simpla": "Простой самовывоз",
  "\"Adresa depozitului si pasii de rezervare au fost clari de la inceput.\"": "\"Адрес склада и шаги резерва были понятны с самого начала.\"",
  "Intrebari frecvente": "Частые вопросы",
  "Raspunsuri rapide inainte de apel": "Короткие ответы перед звонком",
  "Panourile sunt disponibile imediat?": "Панели доступны сразу?",
  "Disponibilitatea se confirma dupa tip, grosime si cantitate. Daca lotul este in stoc, il putem rezerva.": "Наличие подтверждается по типу, толщине и количеству. Если партия есть на складе, мы можем ее зарезервировать.",
  "Pot primi oferta fara proiect complet?": "Можно получить предложение без полного проекта?",
  "Da. Pentru o estimare initiala este suficient tipul panoului, cantitatea aproximativa si telefonul.": "Да. Для первичной оценки достаточно типа панели, примерного количества и телефона.",
  "Unde se ridica materialul?": "Где забрать материал?",
  "Depozitul este in mun. Balti, str. Lev Dovator 1. Pentru alte localitati discutam separat logistica.": "Склад находится в мун. Бельцы, ул. Лев Доватор 1. Для других населенных пунктов логистика обсуждается отдельно.",
  "Ai nevoie de panouri?": "Нужны панели?",
  "Trimite cererea si verificam stocul.": "Отправьте заявку, и мы проверим склад.",
  "Contacte": "Контакты",
  "TEHNOFASAD S.R.L.": "TEHNOFASAD S.R.L.",
  "Panouri sandwich si materiale pentru acoperisuri, cu stoc si consultatie in Balti.": "Сэндвич-панели и кровельные материалы со складом и консультацией в Бельцах.",
  "Linkuri utile": "Полезные ссылки",
  "Intrebari frecvente": "Частые вопросы",
  "mun. Balti, str. Lev Dovator, 1": "мун. Бельцы, ул. Лев Доватор, 1",
  "Completeaza formularul": "Заполнить форму",
  "Harta": "Карта",
  "Deschide in Google Maps": "Открыть в Google Maps",
  "Messenger": "Мессенджеры",
  "WhatsApp": "WhatsApp",
  "Viber": "Viber",
  "Telegram": "Telegram",
  "Suna": "Позвонить",
  "Cerere oferta": "Заявка на предложение",
  "Lasati datele si cantitatea aproximativa. Revenim cu pretul si disponibilitatea.": "Оставьте данные и примерное количество. Мы вернемся с ценой и наличием.",
  "Comentariu": "Комментарий",
  "sunt de acord cu politica de confidentialitate": "согласен с политикой конфиденциальности",
};

const placeholdersRu = {
  Nume: "Имя",
  "Cantitate, ex. 250 m2": "Количество, напр. 250 м2",
  "ex. 250 m2": "напр. 250 м2",
  "ex. Balti": "напр. Бельцы",
  "perete, acoperis, grosime": "стена, кровля, толщина",
};

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function applyLanguage(lang) {
  const dict = i18n[lang] || i18n.ro;
  document.documentElement.lang = lang;
  localStorage.setItem("siteLang", lang);

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (dict[key]) {
      element.textContent = dict[key];
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if (dict[key]) {
      element.placeholder = dict[key];
    }
  });

  document.querySelectorAll("h1, h2, h3, p, li, span, strong, dt, dd, summary, button, a, option, label > span").forEach((element) => {
    if (element.children.length > 0 && !element.dataset.i18n) {
      return;
    }

    if (!element.dataset.originalText) {
      element.dataset.originalText = normalizeText(element.textContent);
    }

    const original = element.dataset.originalText;
    if (element.dataset.i18n) {
      return;
    }

    element.textContent = lang === "ru" && phraseRu[original] ? phraseRu[original] : original;
  });

  document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((element) => {
    if (!element.dataset.originalPlaceholder) {
      element.dataset.originalPlaceholder = element.placeholder;
    }

    const original = element.dataset.originalPlaceholder;
    element.placeholder = lang === "ru" && placeholdersRu[original] ? placeholdersRu[original] : original;
  });

  langButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.lang === lang);
  });
}

function currentText(key) {
  const lang = localStorage.getItem("siteLang") || "ro";
  return i18n[lang]?.[key] || i18n.ro[key];
}

function updateAiQuickMenu(lang) {
  const roItems = [
    ["Hala industriala", "Hala industriala"],
    ["Depozit / magazie", "Depozit / magazie"],
    ["Acoperis casa", "Acoperis casa"],
    ["Gard / imprejmuire", "Gard / imprejmuire"],
  ];
  const ruItems = [
    ["Цена панелей", "Хочу получить предложение на сэндвич-панели. Какие данные нужно отправить?"],
    ["Выбор панели", "Помоги выбрать между стеновой и кровельной сэндвич-панелью."],
    ["Толщина", "Какую толщину сэндвич-панели выбрать для моего проекта?"],
    ["3D крыша", "Как рассчитать крышу в 3D-конфигураторе и какие данные нужны?"],
    ["Склад/доставка", "Как проверить наличие и доставку материалов?"],
    ["Обратный звонок", "Хочу, чтобы специалист TEHNOFASAD мне перезвонил."],
    ["Объект 20x40", "У меня ангар 20x40. Помоги оценить площадь и какие данные еще нужны."],
  ];
  const displayItems = lang === "ru" ? [
    ["Сэндвич-панели", "Сэндвич-панели"],
    ["Кровля (профнастил)", "Кровля (профнастил)"],
    ["Металлочерепица", "Металлочерепица"],
    ["Забор / ограждение", "Забор / ограждение"],
  ] : roItems;
  aiQuickButtons.forEach((button, index) => {
    if (!displayItems[index]) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    button.textContent = displayItems[index][0];
    button.dataset.aiPrompt = displayItems[index][1];
  });
}

function openForm() {
  if (!modal) {
    return;
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  modal.querySelector("input")?.focus();
}

window.openLeadForm = openForm;

function closeForm() {
  if (!modal) {
    return;
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function getFormPayload(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function getApiEndpoint(path) {
  const isLocalStaticPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    && window.location.port
    && window.location.port !== "3000";

  return isLocalStaticPreview ? `http://localhost:3000${path}` : path;
}

async function submitLead(form) {
  const status = form.querySelector(".form-status");
  const button = form.querySelector("button[type='submit']");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const payload = getFormPayload(form);
  const phoneDigits = String(payload.phone || "").replace(/\D/g, "");

  if (phoneDigits.length < 8) {
    status.textContent = currentText("invalidPhone");
    return;
  }

  status.textContent = currentText("sending");
  button.disabled = true;

  try {
    const response = await fetch(getApiEndpoint("/api/leads"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      status.textContent = currentText("failed");
      return;
    }

    form.reset();
    status.textContent = currentText("sent");

    if (form.classList.contains("offer-form")) {
      setTimeout(closeForm, 900);
    }
  } catch (error) {
    status.textContent = currentText("failed");
  } finally {
    button.disabled = false;
  }
}

openButtons.forEach((button) => button.addEventListener("click", openForm));
closeButtons.forEach((button) => button.addEventListener("click", closeForm));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal.classList.contains("is-open")) {
    closeForm();
  }
});

leadForms.forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitLead(form);
  });
});

langButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyLanguage(button.dataset.lang);
    updateAiQuickMenu(button.dataset.lang);
  });
});

applyLanguage(localStorage.getItem("siteLang") || "ro");
updateAiQuickMenu(localStorage.getItem("siteLang") || "ro");

if (navToggle && mainNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("is-open");
    navToggle.classList.toggle("is-active", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mainNav.classList.remove("is-open");
      navToggle.classList.remove("is-active");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mainNav.classList.contains("is-open")) {
      mainNav.classList.remove("is-open");
      navToggle.classList.remove("is-active");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
}

const portfolioFilters = document.querySelectorAll(".portfolio-filters button");
const portfolioItems = document.querySelectorAll(".portfolio-item");

if (portfolioFilters.length > 0) {
  portfolioFilters.forEach(button => {
    button.addEventListener("click", () => {
      // Remove active class from all buttons
      portfolioFilters.forEach(btn => btn.classList.remove("active"));
      // Add active class to clicked button
      button.classList.add("active");

      const filterValue = button.getAttribute("data-filter");

      portfolioItems.forEach(item => {
        const itemCategory = item.getAttribute("data-category");

        if (filterValue === "all" || itemCategory.includes(filterValue)) {
          item.classList.remove("hidden");
        } else {
          item.classList.add("hidden");
        }
      });
    });
  });
}

// Scroll Animations
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15, rootMargin: "0px 0px -50px 0px" });

document.querySelectorAll(".reveal").forEach(el => revealObserver.observe(el));

function getAiMessageTime() {
  return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function getAiWelcomeText(lang) {
  if (lang === "ru") {
    return "Здравствуйте! Я AI-консультант TEHNOFASAD. Помогу выбрать материалы и рассчитать ориентир для проекта.\n\nДля какого типа объекта нужны материалы?";
  }
  return "Buna ziua! Sunt consultantul AI TEHNOFASAD. Va ajut sa alegeti materialele si calculez estimarea pentru proiectul dvs.\n\nPentru ce tip de constructie aveti nevoie de materiale?";
}

function appendAiMessage(text, type = "bot") {
  if (!aiChatMessages) return;
  const message = document.createElement("div");
  message.className = `ai-chat__message ai-chat__message--${type}`;

  if (type === "typing") {
    message.innerHTML = '<span class="ai-chat__typing" aria-label="Typing"><i></i><i></i><i></i></span>';
  } else {
    const textNode = document.createElement("span");
    textNode.textContent = text;
    message.appendChild(textNode);

    if (type !== "system") {
      const time = document.createElement("small");
      time.textContent = getAiMessageTime();
      message.appendChild(time);
    }
  }

  aiChatMessages.appendChild(message);
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
  return message;
}

function setAiFormBusy(isBusy) {
  if (!aiChatForm) return;
  aiChatForm.querySelectorAll("input, button").forEach((element) => {
    if (element.matches("[data-ai-reset]")) return;
    element.disabled = isBusy;
  });
}

async function typeAiMessage(text, type = "bot") {
  const message = appendAiMessage("", type);
  const textNode = message?.querySelector("span");
  const finalText = String(text || "");

  if (!textNode || type !== "bot") {
    if (textNode) textNode.textContent = finalText;
    return message;
  }

  textNode.textContent = "";
  const chunkSize = finalText.length > 360 ? 4 : 2;

  for (let index = 0; index < finalText.length; index += chunkSize) {
    textNode.textContent += finalText.slice(index, index + chunkSize);
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    await new Promise((resolve) => setTimeout(resolve, 14));
  }

  return message;
}

function appendAiCrmCard(data) {
  if (!aiChatMessages || !data) return;
  const lang = localStorage.getItem("siteLang") || "ro";
  const labels = lang === "ru"
    ? {
      title: "Заявка для CRM",
      copied: "Скопировано",
      copy: "Копировать",
      name: "Клиент",
      phone: "Телефон",
      object: "Объект",
      area: "Площадь",
      thickness: "Толщина",
      logistics: "Логистика",
      estimate: "Оценка",
    }
    : {
      title: "Cerere pentru CRM",
      copied: "Copiat",
      copy: "Copiaza",
      name: "Client",
      phone: "Telefon",
      object: "Obiect",
      area: "Suprafata",
      thickness: "Grosime",
      logistics: "Logistica",
      estimate: "Estimare",
    };
  const rows = [
    [labels.name, data.name],
    [labels.phone, data.phone],
    [labels.object, data.object],
    [labels.area, data.area_m2 ? `${data.area_m2} m2` : ""],
    [labels.thickness, data.thickness],
    [labels.logistics, data.logistics],
    [labels.estimate, data.estimate_mdl],
  ].filter(([, value]) => value);
  const card = document.createElement("div");
  card.className = "ai-chat__crm-card";

  const header = document.createElement("div");
  header.className = "ai-chat__crm-card-head";

  const title = document.createElement("strong");
  title.textContent = labels.title;

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = labels.copy;

  const copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      copyButton.textContent = labels.copied;
      setTimeout(() => { copyButton.textContent = labels.copy; }, 1600);
    } catch (error) {
      copyButton.textContent = labels.copy;
    }
  });

  header.append(title, copyButton);
  card.appendChild(header);

  rows.forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "ai-chat__crm-row";
    const keyNode = document.createElement("span");
    keyNode.textContent = key;
    const valueNode = document.createElement("b");
    valueNode.textContent = value;
    row.append(keyNode, valueNode);
    card.appendChild(row);
  });

  aiChatMessages.appendChild(card);
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
}

function setAiChatOpen(isOpen) {
  if (!aiChat || !aiChatToggle || !aiChatPanel) return;
  aiChat.classList.remove("is-menu-open");
  aiChannelMenu?.setAttribute("aria-hidden", "true");
  aiChat.classList.toggle("is-open", isOpen);
  document.body.classList.toggle("ai-chat-open", isOpen);
  aiChatToggle.setAttribute("aria-expanded", String(isOpen));
  aiChatPanel.setAttribute("aria-hidden", String(!isOpen));
  if (isOpen) {
    aiChatForm?.elements.message?.focus();
  }
}

function setAiChannelMenuOpen(isOpen) {
  if (!aiChat || !aiChatToggle || !aiChannelMenu) return;
  aiChat.classList.toggle("is-menu-open", isOpen);
  aiChannelMenu.setAttribute("aria-hidden", String(!isOpen));
  aiChatToggle.setAttribute("aria-expanded", String(isOpen));
}

function resetAiChat() {
  if (!aiChatMessages) return;
  aiChatHistory.length = 0;
  accumulatedLead = {};
  aiChatMessages.innerHTML = "";
  appendAiMessage(getAiWelcomeText(localStorage.getItem("siteLang") || "ro"), "bot");
}

async function sendAiChatMessage(text) {
  const lang = localStorage.getItem("siteLang") || "ro";
  aiChatHistory.push({ role: "user", content: text });
  appendAiMessage(text, "user");
  const pending = appendAiMessage("", "typing");
  setAiFormBusy(true);

  try {
    const response = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, messages: aiChatHistory.slice(-10), accumulatedLead }),
    });

    if (!response.ok) {
      pending?.remove();
      await typeAiMessage(lang === "ru" ? "Сейчас AI недоступен. Позвоните: +373(791)55791." : "AI nu este disponibil acum. Sunati la +373(791)55791.", "bot");
      return;
    }

    const payload = await response.json();
    pending?.remove();
    await typeAiMessage(payload.answer || (lang === "ru" ? "Не удалось получить ответ." : "Nu am putut genera raspunsul."), "bot");
    aiChatHistory.push({ role: "assistant", content: payload.answer || "" });

    if (payload.crmData) {
       accumulatedLead = { ...accumulatedLead, ...payload.crmData };
    }

    if (payload.leadCreated) {
      appendAiMessage(lang === "ru" ? "Заявка создана. Специалист свяжется с вами." : "Cererea a fost creata. Un specialist va va contacta.", "system");
      appendAiCrmCard(payload.crmData);
    }
  } catch (error) {
    pending?.remove();
    await typeAiMessage(lang === "ru" ? "Сейчас AI недоступен. Позвоните: +373(791)55791." : "AI nu este disponibil acum. Sunati la +373(791)55791.", "bot");
  } finally {
    setAiFormBusy(false);
    aiChatForm?.elements.message?.focus();
  }
}

aiChatToggle?.addEventListener("click", () => {
  setAiChannelMenuOpen(!aiChat?.classList.contains("is-menu-open"));
});

aiChatClose?.addEventListener("click", () => setAiChatOpen(false));
aiChannelChat?.addEventListener("click", () => setAiChatOpen(true));

document.addEventListener("click", (event) => {
  if (aiChat?.classList.contains("is-menu-open") && !aiChat.contains(event.target)) {
    setAiChannelMenuOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (aiChat?.classList.contains("is-open")) setAiChatOpen(false);
  if (aiChat?.classList.contains("is-menu-open")) setAiChannelMenuOpen(false);
});

aiChatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = aiChatForm.elements.message;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  sendAiChatMessage(text);
});

aiLeadButton?.addEventListener("click", () => {
  setAiChatOpen(true);
  aiLeadForm?.classList.toggle("is-open");
  aiLeadForm?.elements.phone?.focus();
});

aiLeadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const lang = localStorage.getItem("siteLang") || "ro";
  const button = aiLeadForm.querySelector("button[type='submit']");
  const phone = aiLeadForm.elements.phone.value.trim();
  const quantity = aiLeadForm.elements.quantity.value.trim();
  const phoneDigits = phone.replace(/\D/g, "");

  if (phoneDigits.length < 8) {
    appendAiMessage(lang === "ru" ? "Введите корректный телефон, чтобы я создал заявку." : "Introduceti un telefon valid ca sa creez cererea.", "system");
    return;
  }

  button.disabled = true;

  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        quantity,
        source: "ai-chat-quick-lead",
        comment: `AI quick lead: ${quantity || "no details"}`,
      }),
    });

    if (!response.ok) {
      appendAiMessage(lang === "ru" ? "Не удалось создать заявку. Позвоните: +373(791)55791." : "Nu am putut crea cererea. Sunati la +373(791)55791.", "bot");
      return;
    }

    aiLeadForm.reset();
    aiLeadForm.classList.remove("is-open");
    appendAiMessage(lang === "ru" ? "Заявка создана в CRM. Специалист TEHNOFASAD свяжется с вами." : "Cererea a fost creata in CRM. Specialistul TEHNOFASAD va va contacta.", "system");
  } catch (error) {
    appendAiMessage(lang === "ru" ? "Не удалось создать заявку. Позвоните: +373(791)55791." : "Nu am putut crea cererea. Sunati la +373(791)55791.", "bot");
  } finally {
    button.disabled = false;
  }
});

aiResetButton?.addEventListener("click", resetAiChat);

aiQuickButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setAiChatOpen(true);
    sendAiChatMessage(button.dataset.aiPrompt);
  });
});

// --- Harta filialelor (Leaflet) ---
const filialeMapEl = document.querySelector("[data-filiale-map]");

if (filialeMapEl && window.L) {
  const branches = [
    {
      number: 1,
      name: "Balti (depozit principal)",
      address: "mun. Balti, str. Lev Dovator, 1",
      phone: "+373(791)55791",
      telHref: "tel:+37379155791",
      lat: 47.7741648,
      lng: 27.9116626,
      mapHref: "https://www.google.com/maps/search/?api=1&query=47.7741648,27.9116626",
    },
    {
      number: 2,
      name: "Balti (piata Tvoy Dom)",
      address: "mun. Balti, str. Locomotivelor, 4",
      phone: "+373(231)7-08-10",
      telHref: "tel:+37323170810",
      lat: 47.785758,
      lng: 27.915462,
      mapHref: "https://www.google.com/maps/place/%D0%A0%D1%8B%D0%BD%D0%BE%D0%BA+%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BC%D0%B0%D1%82%D0%B5%D1%80%D0%B8%D0%B0%D0%BB%D0%BE%D0%B2+%22%D0%A2%D0%B2%D0%BE%D0%B9+%D0%94%D0%BE%D0%BC%22/data=!4m2!3m1!1s0x0:0xc32f5a1c3d5dd609",
    },
    {
      number: 3,
      name: "Eurofasad",
      address: "Balti, s. Corlateni",
      phone: "+37376599997",
      telHref: "tel:+37376599997",
      lat: 47.7926212,
      lng: 27.879512,
      mapHref: "https://maps.app.goo.gl/xePpVqr6Zmmbfcxm9",
    },
  ];

  const map = L.map(filialeMapEl, {
    scrollWheelZoom: false,
    attributionControl: false,
  }).setView([47.784, 27.9], 12);

  L.control.attribution({ prefix: false, position: "bottomright" })
    .addAttribution('&copy; OSM &copy; CARTO')
    .addTo(map);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '',
    maxZoom: 19,
  }).addTo(map);

  const bounds = [];

  branches.forEach((branch) => {
    const icon = L.divIcon({
      className: "",
      html: `<div class="filiale-pin"><div class="filiale-pin__pointer"><span class="filiale-pin__number">${branch.number}</span></div></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 30],
      popupAnchor: [0, -30],
    });

    const marker = L.marker([branch.lat, branch.lng], { icon }).addTo(map);

    marker.bindPopup(`
      <div class="filiale-popup">
        <strong>${branch.name}</strong>
        <span>${branch.address}</span>
        <span>${branch.phone}</span>
        <a href="${branch.mapHref}" target="_blank" rel="noreferrer">Deschide in Google Maps &rarr;</a>
      </div>
    `);

    bounds.push([branch.lat, branch.lng]);
  });

  map.fitBounds(bounds, { padding: [48, 48] });

  filialeMapEl.addEventListener("click", () => map.scrollWheelZoom.enable());
  filialeMapEl.addEventListener("mouseleave", () => map.scrollWheelZoom.disable());
}
