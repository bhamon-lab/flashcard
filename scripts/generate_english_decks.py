#!/usr/bin/env python3
"""Génère le catalogue de listes d'anglais et leurs variantes d'écoute."""

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "decks" / "anglais"

LEVELS = {
    "6e": {"label": "6e", "file": "6e", "color": "#D8EAF8"},
    "5e": {"label": "5e", "file": "5e", "color": "#DDEEDB"},
    "4e": {"label": "4e", "file": "4e", "color": "#F8E8C8"},
    "3e": {"label": "3e", "file": "3e", "color": "#F4D9D5"},
    "2de": {"label": "2de", "file": "2de", "color": "#E5DDF5"},
    "1re": {"label": "1re", "file": "1re", "color": "#D9E4F2"},
    "Terminale": {"label": "Terminale", "file": "term", "color": "#E7D7E9"},
}

# Chaque triplet contient : identifiant, titre affiché, couples français/anglais.
VOCAB = {
    "6e": [
        ("salutations", "Salutations et politesse", [
            ("bonjour", "hello"), ("salut", "hi"), ("bonjour-le-matin", "good morning"),
            ("bon-apres-midi", "good afternoon"), ("bonsoir", "good evening"),
            ("au-revoir", "goodbye"), ("a-bientot", "see you soon"),
            ("s-il-vous-plait", "please"), ("merci", "thank you"), ("desole", "sorry"),
        ]),
        ("couleurs", "Couleurs", [
            ("rouge", "red"), ("bleu", "blue"), ("vert", "green"), ("jaune", "yellow"),
            ("orange", "orange"), ("rose", "pink"), ("violet", "purple"), ("marron", "brown"),
            ("noir", "black"), ("blanc", "white"),
        ]),
        ("maison", "Pièces de la maison", [
            ("la-cuisine", "the kitchen"), ("le-salon", "the living room"),
            ("la-salle-a-manger", "the dining room"), ("la-chambre", "the bedroom"),
            ("la-salle-de-bains", "the bathroom"), ("les-toilettes", "the toilet"),
            ("le-jardin", "the garden"), ("le-garage", "the garage"),
            ("le-grenier", "the attic"), ("le-couloir", "the hallway"),
        ]),
        ("famille", "Famille", [
            ("la-mere", "the mother"), ("le-pere", "the father"), ("les-parents", "the parents"),
            ("la-soeur", "the sister"), ("le-frere", "the brother"),
            ("la-grand-mere", "the grandmother"), ("le-grand-pere", "the grandfather"),
            ("la-tante", "the aunt"), ("l-oncle", "the uncle"), ("le-cousin-ou-la-cousine", "the cousin"),
        ]),
        ("ecole", "École et classe", [
            ("un-cahier", "an exercise book"), ("un-livre", "a book"), ("un-stylo", "a pen"),
            ("un-crayon", "a pencil"), ("une-gomme", "a rubber"), ("une-regle", "a ruler"),
            ("un-cartable", "a schoolbag"), ("un-bureau", "a desk"),
            ("un-tableau", "a board"), ("les-devoirs", "homework"),
        ]),
    ],
    "5e": [
        ("routine", "Routine quotidienne", [
            ("se-reveiller", "to wake up"), ("se-lever", "to get up"), ("s-habiller", "to get dressed"),
            ("prendre-le-petit-dejeuner", "to have breakfast"), ("aller-au-college", "to go to school"),
            ("dejeuner", "to have lunch"), ("rentrer-a-la-maison", "to go home"),
            ("faire-ses-devoirs", "to do one's homework"), ("diner", "to have dinner"),
            ("aller-se-coucher", "to go to bed"),
        ]),
        ("ville", "Ville et directions", [
            ("la-gare", "the station"), ("la-mairie", "the town hall"), ("la-bibliotheque", "the library"),
            ("le-carrefour", "the crossroads"), ("le-feu-de-circulation", "the traffic light"),
            ("tourner-a-gauche", "to turn left"), ("tourner-a-droite", "to turn right"),
            ("aller-tout-droit", "to go straight on"), ("en-face-de", "opposite"), ("a-cote-de", "next to"),
        ]),
        ("loisirs", "Loisirs et sports", [
            ("jouer-au-football", "to play football"), ("faire-de-la-natation", "to go swimming"),
            ("faire-du-velo", "to go cycling"), ("dessiner", "to draw"), ("lire", "to read"),
            ("ecouter-de-la-musique", "to listen to music"), ("regarder-un-film", "to watch a film"),
            ("jouer-aux-jeux-video", "to play video games"), ("cuisiner", "to cook"),
            ("retrouver-ses-amis", "to meet friends"),
        ]),
    ],
    "4e": [
        ("voyage", "Voyage et transports", [
            ("un-billet-aller-simple", "a single ticket"), ("un-billet-aller-retour", "a return ticket"),
            ("le-quai", "the platform"), ("la-carte-d-embarquement", "the boarding pass"),
            ("les-bagages", "luggage"), ("un-vol", "a flight"), ("retarde", "delayed"),
            ("annule", "cancelled"), ("reserver", "to book"), ("rater-le-train", "to miss the train"),
        ]),
        ("sante", "Corps et santé", [
            ("la-tete", "the head"), ("la-gorge", "the throat"), ("le-dos", "the back"),
            ("avoir-mal-a-la-tete", "to have a headache"), ("avoir-de-la-fievre", "to have a fever"),
            ("tousser", "to cough"), ("etre-enrhume", "to have a cold"),
            ("un-medicament", "medicine"), ("un-medecin", "a doctor"), ("se-reposer", "to rest"),
        ]),
        ("meteo-environnement", "Météo et environnement", [
            ("ensoleille", "sunny"), ("nuageux", "cloudy"), ("venteux", "windy"),
            ("un-orage", "a thunderstorm"), ("une-secheresse", "a drought"), ("une-inondation", "a flood"),
            ("la-pollution", "pollution"), ("recycler", "to recycle"),
            ("economiser-l-eau", "to save water"), ("les-dechets", "waste"),
        ]),
    ],
    "3e": [
        ("medias", "Médias et numérique", [
            ("un-titre-de-presse", "a headline"), ("une-source", "a source"), ("un-reportage", "a news report"),
            ("les-reseaux-sociaux", "social media"), ("les-fausses-informations", "fake news"),
            ("partager", "to share"), ("telecharger", "to download"), ("un-mot-de-passe", "a password"),
            ("les-donnees-personnelles", "personal data"), ("le-cyberharcelement", "cyberbullying"),
        ]),
        ("citoyennete", "Société et citoyenneté", [
            ("un-citoyen", "a citizen"), ("un-droit", "a right"), ("un-devoir", "a duty"),
            ("une-loi", "a law"), ("une-election", "an election"), ("voter", "to vote"),
            ("l-egalite", "equality"), ("la-liberte", "freedom"), ("la-discrimination", "discrimination"),
            ("faire-du-benevolat", "to volunteer"),
        ]),
        ("relations", "Émotions et relations", [
            ("fier", "proud"), ("inquiet", "worried"), ("decu", "disappointed"), ("reconnaissant", "grateful"),
            ("digne-de-confiance", "trustworthy"), ("genereux", "generous"), ("timide", "shy"),
            ("s-entendre-avec", "to get along with"), ("se-disputer", "to argue"), ("soutenir", "to support"),
        ]),
    ],
    "2de": [
        ("identite", "Identité et relations", [
            ("l-appartenance", "belonging"), ("les-origines", "background"), ("un-modele", "a role model"),
            ("les-pairs", "peers"), ("la-confiance-en-soi", "self-confidence"),
            ("une-valeur", "a value"), ("un-prejuge", "a prejudice"), ("s-integrer", "to fit in"),
            ("se-demarquer", "to stand out"), ("assumer-son-identite", "to embrace one's identity"),
        ]),
        ("environnement", "Environnement et solutions", [
            ("le-changement-climatique", "climate change"), ("l-empreinte-carbone", "the carbon footprint"),
            ("les-combustibles-fossiles", "fossil fuels"), ("les-energies-renouvelables", "renewable energy"),
            ("la-biodiversite", "biodiversity"), ("une-espece-menacee", "an endangered species"),
            ("reduire", "to reduce"), ("reutiliser", "to reuse"), ("sensibiliser", "to raise awareness"),
            ("le-developpement-durable", "sustainable development"),
        ]),
        ("arts-pouvoir", "Arts et pouvoir", [
            ("une-oeuvre-d-art", "a work of art"), ("un-chef-d-oeuvre", "a masterpiece"),
            ("un-portrait", "a portrayal"), ("un-symbole", "a symbol"), ("un-message", "a message"),
            ("representer", "to depict"), ("souligner", "to highlight"), ("denoncer", "to denounce"),
            ("censurer", "to censor"), ("transmettre", "to convey"),
        ]),
    ],
    "1re": [
        ("analyse-medias", "Analyse des médias", [
            ("le-public-cible", "the target audience"), ("un-parti-pris", "a bias"),
            ("une-source-fiable", "a reliable source"), ("un-temoignage", "an account"),
            ("une-preuve", "evidence"), ("une-affirmation", "a claim"), ("induire-en-erreur", "to mislead"),
            ("verifier-les-faits", "to fact-check"), ("façonner-l-opinion", "to shape opinion"),
            ("remettre-en-question", "to challenge"),
        ]),
        ("innovation-ethique", "Innovation et éthique", [
            ("une-percee", "a breakthrough"), ("un-inconvenient", "a drawback"), ("un-enjeu-ethique", "an ethical issue"),
            ("la-vie-privee", "privacy"), ("la-surveillance", "surveillance"), ("un-algorithme", "an algorithm"),
            ("un-biais", "a bias"), ("reglementer", "to regulate"), ("rendre-des-comptes", "to be accountable"),
            ("peser-le-pour-et-le-contre", "to weigh the pros and cons"),
        ]),
        ("migration-memoire", "Migration et mémoire", [
            ("un-migrant", "a migrant"), ("un-refugie", "a refugee"), ("l-exil", "exile"),
            ("une-frontiere", "a border"), ("le-patrimoine", "heritage"), ("un-heritage", "a legacy"),
            ("un-souvenir", "a memory"), ("s-installer", "to settle"), ("fuir", "to flee"),
            ("commemorer", "to commemorate"),
        ]),
    ],
    "Terminale": [
        ("argumentation", "Débat et argumentation", [
            ("une-hypothese", "an assumption"), ("une-objection", "an objection"), ("un-contre-argument", "a counterargument"),
            ("une-nuance", "a qualification"), ("un-compromis", "a compromise"), ("convaincant", "compelling"),
            ("contestable", "questionable"), ("refuter", "to refute"), ("l-emporter-sur", "to outweigh"),
            ("dans-une-certaine-mesure", "to some extent"),
        ]),
        ("politique-societe", "Politique et société", [
            ("une-partie-prenante", "a stakeholder"), ("une-politique-publique", "a policy"),
            ("un-decideur", "a policymaker"), ("la-responsabilite", "accountability"),
            ("les-inegalites", "inequalities"), ("l-inclusion", "inclusion"), ("un-dispositif-de-protection", "a safeguard"),
            ("mettre-en-oeuvre", "to implement"), ("faire-respecter", "to enforce"), ("favoriser", "to foster"),
        ]),
        ("enjeux-mondiaux", "Enjeux mondiaux et technologie", [
            ("une-consequence-imprevue", "an unintended consequence"), ("une-menace", "a threat"),
            ("la-resilience", "resilience"), ("la-penurie", "scarcity"), ("la-durabilite", "sustainability"),
            ("l-intelligence-artificielle", "artificial intelligence"), ("la-fracture-numerique", "the digital divide"),
            ("a-grande-echelle", "on a large scale"), ("a-long-terme", "in the long run"),
            ("fonde-sur-des-preuves", "evidence-based"),
        ]),
    ],
}

CULTURE = {
    "6e": ("Pays anglophones et capitales", [
        ("Quelle est la capitale du Royaume-Uni ?", "London (Londres)."),
        ("Quelle est la capitale de l'Irlande ?", "Dublin."),
        ("Quelle est la capitale des États-Unis ?", "Washington, D.C."),
        ("Quelle est la capitale du Canada ?", "Ottawa."),
        ("Quelle est la capitale de l'Australie ?", "Canberra."),
        ("Quelle est la capitale de la Nouvelle-Zélande ?", "Wellington."),
        ("Quelles sont les quatre nations du Royaume-Uni ?", "England, Scotland, Wales and Northern Ireland."),
        ("Quelle monnaie utilise-t-on au Royaume-Uni ?", "The pound sterling (£)."),
        ("Quel symbole végétal représente l'Irlande ?", "The shamrock (le trèfle)."),
        ("Comment appelle-t-on le drapeau du Royaume-Uni ?", "The Union Jack / the Union Flag."),
    ]),
    "5e": ("Royaume-Uni : repères et fêtes", [
        ("Quel fleuve traverse Londres ?", "The River Thames."),
        ("Dans quelle ville se trouve Big Ben ?", "London."),
        ("Quelle capitale écossaise possède un célèbre château ?", "Edinburgh."),
        ("Quelle est la capitale du pays de Galles ?", "Cardiff."),
        ("Quelle est la capitale de l'Irlande du Nord ?", "Belfast."),
        ("Quand célèbre-t-on Halloween ?", "On 31 October."),
        ("Que célèbre Bonfire Night au Royaume-Uni ?", "The failure of the Gunpowder Plot of 1605, on 5 November."),
        ("Quel repas britannique associe poisson frit et frites ?", "Fish and chips."),
        ("Quel sport est associé au tournoi de Wimbledon ?", "Tennis."),
        ("À quoi servent les red double-decker buses ?", "They are iconic double-decker buses used for public transport."),
    ]),
    "4e": ("Irlande, Canada, Australie et Nouvelle-Zélande", [
        ("Quelle ville est la capitale de l'Irlande ?", "Dublin."),
        ("Quel saint est célébré le 17 mars ?", "Saint Patrick."),
        ("Quelles sont les deux langues officielles du Canada ?", "English and French."),
        ("Quelle feuille figure sur le drapeau canadien ?", "A maple leaf."),
        ("Quelle est la capitale de l'Australie ?", "Canberra, not Sydney."),
        ("Comment s'appelle le célèbre opéra de Sydney ?", "The Sydney Opera House."),
        ("Qui sont les peuples autochtones d'Australie ?", "Aboriginal and Torres Strait Islander peoples."),
        ("Quelle est la capitale de la Nouvelle-Zélande ?", "Wellington."),
        ("Quel nom māori désigne la Nouvelle-Zélande ?", "Aotearoa."),
        ("Quel oiseau incapable de voler symbolise la Nouvelle-Zélande ?", "The kiwi."),
    ]),
    "3e": ("Figures historiques et droits civiques", [
        ("Qui a refusé de céder sa place dans un bus en 1955 ?", "Rosa Parks."),
        ("Qui a prononcé le discours “I Have a Dream” en 1963 ?", "Martin Luther King Jr."),
        ("Quel président américain a signé l'Emancipation Proclamation ?", "Abraham Lincoln."),
        ("Qui fut le premier président noir d'Afrique du Sud ?", "Nelson Mandela."),
        ("Quelle militante pakistanaise défend l'éducation des filles ?", "Malala Yousafzai."),
        ("Qui fut la première femme Première ministre du Royaume-Uni ?", "Margaret Thatcher."),
        ("Quel mouvement britannique a revendiqué le droit de vote des femmes ?", "The suffragette movement."),
        ("Qui était Emmeline Pankhurst ?", "A leading British suffragette."),
        ("Que commémore Martin Luther King Jr. Day ?", "The life and achievements of Martin Luther King Jr."),
        ("Que désigne the Civil Rights Movement ?", "The movement for equal rights, especially for Black Americans."),
    ]),
    "2de": ("Institutions américaines et britanniques", [
        ("Où siège le Parlement britannique ?", "At the Palace of Westminster in London."),
        ("Quelles sont les deux chambres du Parlement britannique ?", "The House of Commons and the House of Lords."),
        ("Qui dirige le gouvernement britannique ?", "The Prime Minister."),
        ("Quel texte américain commence par “We the People” ?", "The Constitution of the United States."),
        ("Quelles sont les trois branches du pouvoir fédéral américain ?", "Legislative, executive and judicial."),
        ("Où siège le président des États-Unis ?", "At the White House in Washington, D.C."),
        ("Quelles sont les deux chambres du Congrès américain ?", "The Senate and the House of Representatives."),
        ("Que célèbre Independence Day le 4 juillet ?", "The adoption of the Declaration of Independence in 1776."),
        ("Qu'est-ce que Thanksgiving aux États-Unis ?", "A national holiday celebrated on the fourth Thursday of November."),
        ("Quel tribunal interprète la Constitution américaine au plus haut niveau ?", "The Supreme Court."),
    ]),
    "1re": ("Littérature, arts et figures anglophones", [
        ("Qui a écrit Romeo and Juliet ?", "William Shakespeare."),
        ("Qui a écrit Pride and Prejudice ?", "Jane Austen."),
        ("Qui a écrit 1984 ?", "George Orwell."),
        ("Qui a écrit Beloved ?", "Toni Morrison."),
        ("Qui a écrit The Great Gatsby ?", "F. Scott Fitzgerald."),
        ("Quel mouvement culturel noir s'est développé à New York dans les années 1920 ?", "The Harlem Renaissance."),
        ("Qui était Maya Angelou ?", "An American poet, memoirist and civil-rights activist."),
        ("Quel artiste est associé au Pop Art et aux Campbell's Soup Cans ?", "Andy Warhol."),
        ("Qui a réalisé le film Psycho ?", "Alfred Hitchcock."),
        ("Quel groupe originaire de Liverpool a marqué la musique populaire ?", "The Beatles."),
    ]),
    "Terminale": ("Commonwealth et institutions contemporaines", [
        ("Qu'est-ce que le Commonwealth ?", "A voluntary association of independent countries, many with historical links to the British Empire."),
        ("Où se trouve le siège des Nations unies ?", "In New York City."),
        ("Que signifie l'abréviation NATO ?", "North Atlantic Treaty Organization."),
        ("Quel accord de 1998 a contribué à la paix en Irlande du Nord ?", "The Good Friday Agreement."),
        ("Qu'est-ce que devolution au Royaume-Uni ?", "The transfer of some powers from Westminster to Scotland, Wales and Northern Ireland."),
        ("Quel jour célèbre-t-on l'Australia Day ?", "On 26 January; the date is also contested and called Invasion Day by many Indigenous people."),
        ("Quel traité de 1840 est fondateur en Nouvelle-Zélande ?", "The Treaty of Waitangi."),
        ("Que célèbre Juneteenth aux États-Unis ?", "The end of slavery in the United States, commemorated on 19 June."),
        ("Quel est le rôle principal de la Cour suprême américaine ?", "To interpret the Constitution and federal law."),
        ("Que désigne Windrush au Royaume-Uni ?", "Post-war Caribbean migration to the UK and the generation associated with it."),
    ]),
}

IRREGULAR = {
    "6e": [
        ("be", "être", "was/were", "been"), ("have", "avoir", "had", "had"),
        ("do", "faire", "did", "done"), ("go", "aller", "went", "gone"),
        ("come", "venir", "came", "come"), ("get", "obtenir", "got", "got/gotten"),
        ("make", "fabriquer", "made", "made"), ("say", "dire", "said", "said"),
        ("see", "voir", "saw", "seen"), ("take", "prendre", "took", "taken"),
    ],
    "5e": [
        ("begin", "commencer", "began", "begun"), ("bring", "apporter", "brought", "brought"),
        ("buy", "acheter", "bought", "bought"), ("drink", "boire", "drank", "drunk"),
        ("eat", "manger", "ate", "eaten"), ("find", "trouver", "found", "found"),
        ("give", "donner", "gave", "given"), ("know", "savoir", "knew", "known"),
        ("read", "lire", "read", "read"), ("write", "écrire", "wrote", "written"),
    ],
    "4e": [
        ("break", "casser", "broke", "broken"), ("choose", "choisir", "chose", "chosen"),
        ("drive", "conduire", "drove", "driven"), ("fall", "tomber", "fell", "fallen"),
        ("feel", "ressentir", "felt", "felt"), ("forget", "oublier", "forgot", "forgotten"),
        ("leave", "quitter", "left", "left"), ("meet", "rencontrer", "met", "met"),
        ("run", "courir", "ran", "run"), ("speak", "parler", "spoke", "spoken"),
    ],
    "3e": [
        ("become", "devenir", "became", "become"), ("build", "construire", "built", "built"),
        ("catch", "attraper", "caught", "caught"), ("fight", "se battre", "fought", "fought"),
        ("grow", "grandir", "grew", "grown"), ("hear", "entendre", "heard", "heard"),
        ("hold", "tenir", "held", "held"), ("lose", "perdre", "lost", "lost"),
        ("send", "envoyer", "sent", "sent"), ("win", "gagner", "won", "won"),
    ],
    "2de": [
        ("deal", "traiter", "dealt", "dealt"), ("draw", "dessiner", "drew", "drawn"),
        ("fly", "voler", "flew", "flown"), ("lead", "mener", "led", "led"),
        ("lie", "être allongé", "lay", "lain"), ("rise", "s'élever", "rose", "risen"),
        ("shake", "secouer", "shook", "shaken"), ("show", "montrer", "showed", "shown"),
        ("throw", "jeter", "threw", "thrown"), ("wear", "porter", "wore", "worn"),
    ],
    "1re": [
        ("arise", "survenir", "arose", "arisen"), ("bear", "supporter", "bore", "borne"),
        ("beat", "battre", "beat", "beaten"), ("bind", "lier", "bound", "bound"),
        ("seek", "chercher", "sought", "sought"), ("shoot", "tirer", "shot", "shot"),
        ("spread", "répandre", "spread", "spread"), ("steal", "voler", "stole", "stolen"),
        ("strike", "frapper", "struck", "struck"), ("tear", "déchirer", "tore", "torn"),
    ],
    "Terminale": [
        ("broadcast", "diffuser", "broadcast", "broadcast"), ("forbid", "interdire", "forbade", "forbidden"),
        ("foresee", "prévoir", "foresaw", "foreseen"), ("overcome", "surmonter", "overcame", "overcome"),
        ("prove", "prouver", "proved", "proven/proved"), ("withdraw", "retirer", "withdrew", "withdrawn"),
        ("withstand", "résister à", "withstood", "withstood"), ("undertake", "entreprendre", "undertook", "undertaken"),
        ("mislead", "induire en erreur", "misled", "misled"), ("uphold", "maintenir", "upheld", "upheld"),
    ],
}

GRAMMAR = {
    "6e": [
        ("be-have-pronoms", "Be, have got et pronoms", [
            ("be-i", "Complète : I ___ eleven.", "I am eleven. / I'm eleven."),
            ("be-he", "Complète : He ___ English.", "He is English. / He's English."),
            ("be-we", "Complète : We ___ ready.", "We are ready. / We're ready."),
            ("be-negative", "Mets à la forme négative : She is tired.", "She isn't tired. / She is not tired."),
            ("be-question", "Transforme en question : You are French.", "Are you French?"),
            ("have-got", "Traduis : « J'ai un frère. »", "I have got a brother. / I've got a brother."),
            ("have-negative", "Traduis : « Elle n'a pas de sœur. »", "She hasn't got a sister."),
            ("subject-pronouns", "Quels pronoms remplacent Emma, Tom et Emma and Tom ?", "she, he, they"),
            ("object-pronouns", "Complète : I like Emma. I often call ___.", "I often call her."),
            ("possessive", "Complète : This is Tom. ___ bag is blue.", "His bag is blue."),
        ]),
        ("present-questions", "Présent simple et questions", [
            ("present-i", "Complète : I ___ football on Saturdays. (play)", "I play football on Saturdays."),
            ("present-he", "Complète : He ___ football on Saturdays. (play)", "He plays football on Saturdays."),
            ("present-negative", "Traduis : « Je n'aime pas le lait. »", "I don't like milk."),
            ("present-negative-he", "Traduis : « Elle ne regarde pas la télévision. »", "She doesn't watch television."),
            ("do-question", "Traduis : « Est-ce que tu habites ici ? »", "Do you live here?"),
            ("does-question", "Traduis : « Est-ce qu'il aime l'école ? »", "Does he like school?"),
            ("question-word", "Complète : ___ do you live? — In Lyon.", "Where do you live?"),
            ("articles", "Complète : ___ cat and ___ elephant.", "A cat and an elephant."),
            ("plural", "Donne le pluriel de child, box et foot.", "children, boxes, feet"),
            ("can", "Traduis : « Je sais nager mais je ne sais pas voler. »", "I can swim, but I can't fly."),
        ]),
    ],
    "5e": [
        ("present-continuous", "Présent continu et fréquence", [
            ("continuous-form", "Complète : They ___ football now. (play)", "They are playing football now."),
            ("continuous-negative", "Mets à la forme négative : She is sleeping.", "She isn't sleeping."),
            ("continuous-question", "Transforme en question : You are listening.", "Are you listening?"),
            ("simple-or-continuous-now", "Choisis : Look! It rains / is raining.", "Look! It is raining."),
            ("simple-or-continuous-usually", "Choisis : He walks / is walking to school every day.", "He walks to school every day."),
            ("frequency-before", "Place often : I play tennis.", "I often play tennis."),
            ("frequency-be", "Place always : She is friendly.", "She is always friendly."),
            ("never", "Traduis : « Nous ne sommes jamais en retard. »", "We are never late."),
            ("how-often", "Demande : « À quelle fréquence lis-tu ? »", "How often do you read?"),
            ("once-twice", "Traduis : « deux fois par semaine ».", "twice a week"),
        ]),
        ("comparatifs-quantites", "Comparatifs et quantités", [
            ("comparative-short", "Complète : York is ___ than London. (small)", "York is smaller than London."),
            ("comparative-big", "Complète : A lion is ___ than a cat. (big)", "A lion is bigger than a cat."),
            ("comparative-long", "Complète : Trains are ___ than buses. (comfortable)", "Trains are more comfortable than buses."),
            ("comparative-good", "Donne le comparatif de good.", "better"),
            ("superlative", "Traduis : « le plus haut bâtiment ».", "the tallest building"),
            ("superlative-good", "Donne le superlatif de good.", "the best"),
            ("some", "Complète : There are ___ apples on the table.", "There are some apples on the table."),
            ("any", "Complète : Are there ___ shops nearby?", "Are there any shops nearby?"),
            ("much-many", "Complète : How ___ water? How ___ bottles?", "How much water? How many bottles?"),
            ("few-little", "Complète : a ___ friends / a ___ time.", "a few friends / a little time"),
        ]),
    ],
    "4e": [
        ("preterit", "Prétérit simple", [
            ("regular", "Mets au prétérit : We visit Dublin.", "We visited Dublin."),
            ("irregular", "Mets au prétérit : She goes home.", "She went home."),
            ("be-past", "Complète : I ___ tired and they ___ hungry.", "I was tired and they were hungry."),
            ("negative", "Mets à la forme négative : He enjoyed the trip.", "He didn't enjoy the trip."),
            ("question", "Traduis : « Où es-tu allé hier ? »", "Where did you go yesterday?"),
            ("short-answer", "Réponds brièvement : Did she call you? (oui)", "Yes, she did."),
            ("ago", "Traduis : « il y a trois jours ».", "three days ago"),
            ("last", "Traduis : « la semaine dernière ».", "last week"),
            ("ed-t", "Quelle prononciation finale pour worked ?", "/t/"),
            ("ed-id", "Quelle prononciation finale pour wanted ?", "/ɪd/"),
        ]),
        ("recit-futur-modaux", "Récit, futur et modaux", [
            ("past-continuous", "Complète : I ___ when you called. (sleep)", "I was sleeping when you called."),
            ("past-interruption", "Complète : We ___ when it ___ to rain. (walk/start)", "We were walking when it started to rain."),
            ("will", "Traduis cette prédiction : « Il pleuvra demain. »", "It will rain tomorrow."),
            ("going-to", "Traduis ce projet : « Nous allons visiter Dublin. »", "We are going to visit Dublin."),
            ("present-future", "Traduis cet arrangement : « Je vois Sam demain. »", "I'm seeing Sam tomorrow."),
            ("should", "Traduis : « Tu devrais te reposer. »", "You should rest."),
            ("must", "Traduis : « Tu dois être prudent. »", "You must be careful."),
            ("mustnt", "Traduis : « Vous ne devez pas entrer. »", "You mustn't enter."),
            ("have-to", "Traduis : « Je dois porter un uniforme. »", "I have to wear a uniform."),
            ("could", "Traduis : « Quand j'avais six ans, je savais nager. »", "When I was six, I could swim."),
        ]),
    ],
    "3e": [
        ("present-perfect", "Present perfect", [
            ("form", "Complète : I ___ London twice. (visit)", "I have visited London twice."),
            ("never", "Traduis : « Je n'ai jamais vu ce film. »", "I have never seen this film."),
            ("ever", "Traduis : « Es-tu déjà allé au Canada ? »", "Have you ever been to Canada?"),
            ("just", "Traduis : « Elle vient de finir. »", "She has just finished."),
            ("already", "Traduis : « Ils ont déjà mangé. »", "They have already eaten."),
            ("yet-question", "Traduis : « As-tu déjà terminé ? »", "Have you finished yet?"),
            ("yet-negative", "Traduis : « Je n'ai pas encore terminé. »", "I haven't finished yet."),
            ("since", "Complète : We have lived here ___ 2022.", "We have lived here since 2022."),
            ("for", "Complète : She has studied English ___ five years.", "She has studied English for five years."),
            ("past-difference", "Choisis : I have seen / saw him yesterday.", "I saw him yesterday: yesterday situe un passé terminé."),
        ]),
        ("conditionnels-obligation", "Conditionnels et obligation", [
            ("zero", "Complète : If you heat ice, it ___. (melt)", "If you heat ice, it melts."),
            ("first", "Complète : If it rains, we ___ home. (stay)", "If it rains, we will stay home."),
            ("unless", "Reformule : If you don't hurry, you will miss the bus.", "Unless you hurry, you will miss the bus."),
            ("must", "Traduis : « Les élèves doivent respecter les règles. »", "Students must follow the rules."),
            ("have-to", "Traduis : « Elle doit se lever tôt. »", "She has to get up early."),
            ("no-obligation", "Traduis : « Tu n'es pas obligé de venir. »", "You don't have to come."),
            ("prohibition", "Traduis : « Vous ne devez pas utiliser votre téléphone. »", "You mustn't use your phone."),
            ("passive-present", "Mets au passif : Millions of people speak English.", "English is spoken by millions of people."),
            ("relative-who", "Relie : The woman is a journalist. She interviewed me.", "The woman who interviewed me is a journalist."),
            ("relative-which", "Relie : I read a book. It changed my mind.", "I read a book which/that changed my mind."),
        ]),
    ],
    "2de": [
        ("temps-du-recit", "Temps du récit", [
            ("past-perfect", "Complète : When we arrived, the film ___. (start)", "When we arrived, the film had started."),
            ("past-perfect-negative", "Traduis : « Elle n'avait jamais voyagé seule. »", "She had never travelled alone."),
            ("three-times", "Complète : He ___ while I ___ dinner. (call/cook)", "He called while I was cooking dinner."),
            ("used-to", "Traduis : « Avant, il habitait à Manchester. »", "He used to live in Manchester."),
            ("would-habit", "Traduis cette habitude passée : « Chaque été, nous allions à la mer. »", "Every summer, we would go to the seaside."),
            ("since-for", "Complète : She has worked here ___ March / ___ six months.", "since March / for six months"),
            ("present-perfect-continuous", "Complète : It ___ all morning. (rain)", "It has been raining all morning."),
            ("narrative-sequence", "Ordonne un récit avec trois connecteurs.", "First, … Then, … Eventually, …"),
            ("suddenly", "Que signifie suddenly dans un récit ?", "soudain / tout à coup"),
            ("by-the-time", "Complète : By the time I arrived, they ___. (leave)", "By the time I arrived, they had left."),
        ]),
        ("relatives-passif-modaux", "Relatives, passif et modaux", [
            ("who", "Complète : The activist ___ spoke was convincing.", "The activist who spoke was convincing."),
            ("whose", "Complète : The writer ___ novel won the prize is Irish.", "The writer whose novel won the prize is Irish."),
            ("where", "Complète : This is the town ___ she grew up.", "This is the town where she grew up."),
            ("passive-past", "Mets au passif : They built the bridge in 1890.", "The bridge was built in 1890."),
            ("passive-modal", "Mets au passif : We must protect wildlife.", "Wildlife must be protected."),
            ("might", "Traduis : « Cette solution pourrait fonctionner. »", "This solution might work."),
            ("must-deduction", "Traduis cette déduction : « Il doit être chez lui. »", "He must be at home."),
            ("cant-deduction", "Traduis cette déduction : « Cela ne peut pas être vrai. »", "It can't be true."),
            ("although", "Relie avec although : It is useful. It is expensive.", "Although it is useful, it is expensive."),
            ("despite", "Complète : ___ the rain, they continued.", "Despite the rain, they continued."),
        ]),
    ],
    "1re": [
        ("passif-discours-indirect", "Passif et discours indirect", [
            ("passive-perfect", "Mets au passif : They have changed the law.", "The law has been changed."),
            ("passive-future", "Mets au passif : They will announce the results tomorrow.", "The results will be announced tomorrow."),
            ("passive-agent", "Quand utilise-t-on by dans une phrase passive ?", "Quand l'agent est utile ou important : The novel was written by Orwell."),
            ("report-statement", "Rapporte : She said, “I am tired.”", "She said (that) she was tired."),
            ("report-present-perfect", "Rapporte : He said, “I have finished.”", "He said (that) he had finished."),
            ("report-question", "Rapporte : He asked, “Where do you live?”", "He asked me where I lived."),
            ("report-yes-no", "Rapporte : She asked, “Are you ready?”", "She asked me if/whether I was ready."),
            ("report-command", "Rapporte : He said, “Close the door.”", "He told me to close the door."),
            ("say-tell", "Complète : She ___ me that she agreed.", "She told me that she agreed."),
            ("report-time", "Dans un récit au passé, que devient today ?", "that day"),
        ]),
        ("hypotheses-nuances", "Hypothèses et nuances", [
            ("second", "Complète : If I ___ more time, I ___ abroad. (have/travel)", "If I had more time, I would travel abroad."),
            ("wish-present", "Traduis : « J'aimerais avoir plus de temps. »", "I wish I had more time."),
            ("wish-ability", "Traduis : « J'aimerais savoir mieux parler anglais. »", "I wish I could speak English better."),
            ("might-deduction", "Traduis : « Il se pourrait qu'elle ait raison. »", "She might be right."),
            ("must-have", "Traduis : « Il a dû oublier. »", "He must have forgotten."),
            ("cant-have", "Traduis : « Elle ne peut pas avoir écrit cela. »", "She can't have written that."),
            ("despite", "Reformule avec despite : Although it was difficult, they succeeded.", "Despite the difficulty, they succeeded."),
            ("whereas", "Relie : One source is optimistic. The other is critical.", "One source is optimistic, whereas the other is critical."),
            ("participle", "Réduis : Because she was inspired, she took action.", "Inspired, she took action."),
            ("hedge", "Atténue l'affirmation : This proves that…", "This suggests that… / This may indicate that…"),
        ]),
    ],
    "Terminale": [
        ("conditionnels-avances", "Conditionnels avancés", [
            ("third", "Complète : If they ___ earlier, they ___ the crisis. (act/avoid)", "If they had acted earlier, they might have avoided the crisis."),
            ("mixed", "Complète : If we had invested earlier, the system ___ safer now. (be)", "If we had invested earlier, the system would be safer now."),
            ("inversion-had", "Reformule sans if : If they had known, they would have acted.", "Had they known, they would have acted."),
            ("inversion-were", "Reformule sans if : If I were you, I would wait.", "Were I you, I would wait."),
            ("provided", "Traduis : « à condition que des garanties soient ajoutées ».", "provided that safeguards are added"),
            ("otherwise", "Relie avec otherwise : Act now. The problem will worsen.", "Act now; otherwise, the problem will worsen."),
            ("should-have", "Traduis : « Ils auraient dû anticiper le risque. »", "They should have anticipated the risk."),
            ("neednt-have", "Traduis : « Tu n'avais pas besoin de venir, mais tu es venu. »", "You needn't have come."),
            ("might-have", "Traduis : « La mesure a peut-être échoué. »", "The measure might have failed."),
            ("would-rather", "Traduis : « Je préférerais qu'ils agissent maintenant. »", "I would rather they acted now."),
        ]),
        ("emphase-synthese", "Emphase et synthèse", [
            ("cleft", "Mets en relief le moment : They acted in 2020.", "It was in 2020 that they acted."),
            ("what-cleft", "Mets en relief le besoin : We need a long-term solution.", "What we need is a long-term solution."),
            ("negative-inversion", "Reformule avec rarely : Governments rarely agree so quickly.", "Rarely do governments agree so quickly."),
            ("not-only", "Complète : Not only ___ costly, but it is also ineffective.", "Not only is it costly, but it is also ineffective."),
            ("participle-clause", "Réduis : Because it was designed carefully, the policy succeeded.", "Designed carefully, the policy succeeded."),
            ("nominalisation", "Nominalise : The government decided to intervene.", "The government's decision to intervene…"),
            ("hedging-likely", "Traduis : « Cette mesure est susceptible d'échouer. »", "This measure is likely to fail."),
            ("hedging-appears", "Atténue : The policy is effective.", "The policy appears to be effective."),
            ("concession", "Traduis : « Aussi utile soit-elle, la mesure reste coûteuse. »", "Useful though it may be, the measure remains costly."),
            ("synthesis", "Relie deux documents convergents mais différents.", "Both documents highlight…, although they approach it from different perspectives."),
        ]),
    ],
}

FRENCH_REPLACEMENTS = {
    "a": "à", "apres": "après", "benevolat": "bénévolat", "bibliotheque": "bibliothèque",
    "annule": "annulé", "biodiversite": "biodiversité", "cote": "côté", "dechets": "déchets",
    "decu": "déçu", "dejeuner": "déjeuner", "decideur": "décideur", "denoncer": "dénoncer",
    "demarquer": "démarquer", "desole": "désolé", "developpement": "développement",
    "diner": "dîner", "durabilite": "durabilité", "ecole": "école", "economiser": "économiser", "ecrire": "écrire",
    "egalite": "égalité", "election": "élection", "energies": "énergies", "enrhume": "enrhumé",
    "echelle": "échelle", "etre": "être", "espece": "espèce", "faconner": "façonner",
    "fievre": "fièvre", "fonde": "fondé", "frontiere": "frontière",
    "frere": "frère", "genereux": "généreux", "heritage": "héritage", "hypothese": "hypothèse",
    "imprevue": "imprévue", "inconvenient": "inconvénient", "inegalites": "inégalités",
    "integrer": "intégrer", "liberte": "liberté", "medecin": "médecin", "medias": "médias",
    "menacee": "menacée", "mere": "mère", "modele": "modèle", "numerique": "numérique",
    "oeuvre": "œuvre", "penurie": "pénurie", "percee": "percée", "pere": "père",
    "plait": "plaît", "prejuge": "préjugé", "privee": "privée", "refugie": "réfugié",
    "refuter": "réfuter", "regle": "règle", "reglementer": "réglementer", "representer": "représenter",
    "reduire": "réduire", "reseaux": "réseaux", "reserver": "réserver", "resilience": "résilience",
    "responsabilite": "responsabilité",
    "retarde": "retardé", "reutiliser": "réutiliser", "reveiller": "réveiller", "secheresse": "sécheresse",
    "soeur": "sœur", "telecharger": "télécharger", "television": "télévision", "ensoleille": "ensoleillé",
    "tete": "tête", "temoignage": "témoignage", "verifier": "vérifier", "velo": "vélo", "video": "vidéo",
    "cyberharcelement": "cyberharcèlement", "donnees": "données", "ecouter": "écouter",
    "medicament": "médicament", "consequence": "conséquence", "commemorer": "commémorer",
}

FRENCH_PHRASES = {
    "bonjour-le-matin": "bonjour (le matin)",
    "bon-apres-midi": "bon après-midi",
    "a-bientot": "à bientôt",
    "s-il-vous-plait": "s’il vous plaît",
    "la-salle-a-manger": "la salle à manger",
    "le-cousin-ou-la-cousine": "le cousin / la cousine",
    "la-grand-mere": "la grand-mère",
    "le-grand-pere": "le grand-père",
    "aller-au-college": "aller au collège",
    "en-face-de": "en face de",
    "a-cote-de": "à côté de",
    "un-billet-aller-simple": "un billet aller simple",
    "un-billet-aller-retour": "un billet aller-retour",
    "avoir-mal-a-la-tete": "avoir mal à la tête",
    "avoir-de-la-fievre": "avoir de la fièvre",
    "economiser-l-eau": "économiser l’eau",
    "faire-du-benevolat": "faire du bénévolat",
    "la-confiance-en-soi": "la confiance en soi",
    "assumer-son-identite": "assumer son identité",
    "l-empreinte-carbone": "l’empreinte carbone",
    "une-oeuvre-d-art": "une œuvre d’art",
    "un-chef-d-oeuvre": "un chef-d’œuvre",
    "façonner-l-opinion": "façonner l’opinion",
    "peser-le-pour-et-le-contre": "peser le pour et le contre",
    "un-enjeu-ethique": "un enjeu éthique",
    "un-contre-argument": "un contre-argument",
    "un-dispositif-de-protection": "un dispositif de protection",
    "mettre-en-oeuvre": "mettre en œuvre",
    "a-grande-echelle": "à grande échelle",
    "a-long-terme": "à long terme",
}


def slugify(value):
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")


def french_label(key):
    if key in FRENCH_PHRASES:
        return FRENCH_PHRASES[key]
    words = key.split("-")
    words = [FRENCH_REPLACEMENTS.get(word, word) for word in words]
    text = " ".join(words)
    return re.sub(r"\b([cdjlmnst]) (?=\w)", r"\1’", text)


def write_deck(file_name, deck):
    path = OUTPUT / f"{file_name}.json"
    path.write_text(json.dumps(deck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def deck_base(level, deck_id, title, description):
    meta = LEVELS[level]
    return {
        "id": deck_id,
        "subject": "Anglais",
        "title": f"Anglais · {meta['label']} · {title}",
        "description": description,
        "format": "people",
        "color": meta["color"],
        "daily_new_limit": 5,
        "grade": level,
    }


def generate():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    expected = set()
    for level, meta in LEVELS.items():
        prefix = meta["file"]
        for topic_id, topic_title, entries in VOCAB[level]:
            vocab_name = f"{prefix}-vocab-{topic_id}"
            vocab_id = f"anglais-{vocab_name}"
            vocab = deck_base(
                level, vocab_id, f"Vocabulaire · {topic_title}",
                f"Liste de vocabulaire — {topic_title.lower()}.",
            )
            vocab["category"] = "vocabulary"
            vocab["cards"] = [
                {
                    "id": slugify(english),
                    "kind": "vocabulaire",
                    "front": f"Traduis en anglais : « {french_label(french)} ».",
                    "back": english,
                }
                for french, english in entries
            ]
            write_deck(vocab_name, vocab)
            expected.add(f"{vocab_name}.json")

            oral_name = f"{prefix}-oral-{topic_id}"
            oral_id = f"anglais-{oral_name}"
            oral = deck_base(
                level, oral_id, f"Compréhension orale · {topic_title}",
                f"Même liste que « {topic_title} », à reconnaître à l'oral.",
            )
            oral.update({"category": "listening", "mode": "listening", "audio_language": "en-GB"})
            oral["cards"] = [
                {
                    "id": slugify(english),
                    "kind": "comprehension-orale",
                    "front": "Écoute, puis donne le sens en français.",
                    "back": french_label(french),
                    "audio_text": english,
                }
                for french, english in entries
            ]
            write_deck(oral_name, oral)
            expected.add(f"{oral_name}.json")

        culture_title, culture_cards = CULTURE[level]
        culture_name = f"{prefix}-culture"
        culture = deck_base(level, f"anglais-{culture_name}", f"Culture · {culture_title}", "Repères culturels du monde anglophone.")
        culture["category"] = "culture"
        culture["cards"] = [
            {"id": f"repere-{index:02d}", "kind": "culture", "front": front, "back": back}
            for index, (front, back) in enumerate(culture_cards, start=1)
        ]
        write_deck(culture_name, culture)
        expected.add(f"{culture_name}.json")

        irregular_name = f"{prefix}-verbes-irreguliers"
        irregular = deck_base(level, f"anglais-{irregular_name}", "Verbes irréguliers", "Infinitif, prétérit, participe passé et sens français.")
        irregular["category"] = "irregular-verbs"
        irregular["cards"] = [
            {
                "id": base,
                "kind": "verbe-irregulier",
                "front": f"{base} — {meaning}",
                "back": f"{base} · {past} · {participle}",
            }
            for base, meaning, past, participle in IRREGULAR[level]
        ]
        write_deck(irregular_name, irregular)
        expected.add(f"{irregular_name}.json")

        for grammar_id, grammar_title, grammar_cards in GRAMMAR[level]:
            grammar_name = f"{prefix}-grammaire-{grammar_id}"
            grammar = deck_base(level, f"anglais-{grammar_name}", f"Grammaire · {grammar_title}", f"Règles et automatismes — {grammar_title.lower()}.")
            grammar["category"] = "grammar"
            grammar["cards"] = [
                {"id": card_id, "kind": "grammaire", "front": front, "back": back}
                for card_id, front, back in grammar_cards
            ]
            write_deck(grammar_name, grammar)
            expected.add(f"{grammar_name}.json")

    unexpected = sorted(path.name for path in OUTPUT.glob("*.json") if path.name not in expected)
    if unexpected:
        raise RuntimeError(f"Fichiers anglais non générés à retirer explicitement : {', '.join(unexpected)}")
    print(f"OK : {len(expected)} decks générés dans {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    generate()
