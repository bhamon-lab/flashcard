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

# Thèmes complémentaires. Les triplets donnent un ID stable, le libellé français
# exact et la réponse anglaise.
EXTRA_VOCAB = {
    "6e": [
        ("nombres-heure", "Nombres et heure", [
            ("one", "un", "one"), ("two", "deux", "two"), ("ten", "dix", "ten"),
            ("twenty", "vingt", "twenty"), ("one-hundred", "cent", "one hundred"),
            ("what-time", "Quelle heure est-il ?", "What time is it?"),
            ("oclock", "Il est huit heures.", "It's eight o'clock."),
            ("half-past", "Il est huit heures et demie.", "It's half past eight."),
            ("quarter-past", "Il est huit heures et quart.", "It's quarter past eight."),
            ("quarter-to", "Il est neuf heures moins le quart.", "It's quarter to nine."),
        ]),
        ("corps", "Parties du corps", [
            ("head", "la tête", "the head"), ("face", "le visage", "the face"),
            ("eye", "un œil", "an eye"), ("ear", "une oreille", "an ear"),
            ("nose", "le nez", "the nose"), ("mouth", "la bouche", "the mouth"),
            ("arm", "un bras", "an arm"), ("hand", "une main", "a hand"),
            ("leg", "une jambe", "a leg"), ("foot", "un pied", "a foot"),
        ]),
        ("vetements", "Vêtements", [
            ("tshirt", "un tee-shirt", "a T-shirt"), ("shirt", "une chemise", "a shirt"),
            ("jumper", "un pull", "a jumper"), ("trousers", "un pantalon", "trousers"),
            ("dress", "une robe", "a dress"), ("skirt", "une jupe", "a skirt"),
            ("coat", "un manteau", "a coat"), ("shoes", "des chaussures", "shoes"),
            ("socks", "des chaussettes", "socks"), ("hat", "un chapeau", "a hat"),
        ]),
    ],
    "5e": [
        ("repas", "Aliments et repas", [
            ("bread", "du pain", "bread"), ("milk", "du lait", "milk"), ("water", "de l'eau", "water"),
            ("fruit", "des fruits", "fruit"), ("vegetables", "des légumes", "vegetables"),
            ("breakfast", "le petit déjeuner", "breakfast"), ("lunch", "le déjeuner", "lunch"),
            ("dinner", "le dîner", "dinner"), ("hungry", "avoir faim", "to be hungry"),
            ("thirsty", "avoir soif", "to be thirsty"),
        ]),
        ("meubles", "Maison et meubles", [
            ("table", "une table", "a table"), ("chair", "une chaise", "a chair"),
            ("bed", "un lit", "a bed"), ("wardrobe", "une armoire", "a wardrobe"),
            ("sofa", "un canapé", "a sofa"), ("shelf", "une étagère", "a shelf"),
            ("lamp", "une lampe", "a lamp"), ("fridge", "un réfrigérateur", "a fridge"),
            ("oven", "un four", "an oven"), ("washing-machine", "une machine à laver", "a washing machine"),
        ]),
        ("animaux", "Animaux et nature", [
            ("pet", "un animal de compagnie", "a pet"), ("dog", "un chien", "a dog"),
            ("cat", "un chat", "a cat"), ("horse", "un cheval", "a horse"),
            ("bird", "un oiseau", "a bird"), ("forest", "une forêt", "a forest"),
            ("river", "une rivière", "a river"), ("mountain", "une montagne", "a mountain"),
            ("sea", "la mer", "the sea"), ("countryside", "la campagne", "the countryside"),
        ]),
        ("saisons", "Saisons et météo", [
            ("spring", "le printemps", "spring"), ("summer", "l'été", "summer"),
            ("autumn", "l'automne", "autumn"), ("winter", "l'hiver", "winter"),
            ("hot", "chaud", "hot"), ("cold", "froid", "cold"), ("rainy", "pluvieux", "rainy"),
            ("snowy", "enneigé", "snowy"), ("weather", "Quel temps fait-il ?", "What's the weather like?"),
            ("temperature", "la température", "the temperature"),
        ]),
        ("matieres", "Matières scolaires", [
            ("english", "l'anglais", "English"), ("maths", "les mathématiques", "maths"),
            ("history", "l'histoire", "history"), ("geography", "la géographie", "geography"),
            ("science", "les sciences", "science"), ("art", "les arts plastiques", "art"),
            ("music", "la musique", "music"), ("pe", "l'éducation physique", "PE"),
            ("timetable", "un emploi du temps", "a timetable"), ("break", "la récréation", "break time"),
        ]),
    ],
    "4e": [
        ("metiers", "Métiers", [
            ("teacher", "un professeur", "a teacher"), ("doctor", "un médecin", "a doctor"),
            ("nurse", "un infirmier", "a nurse"), ("engineer", "un ingénieur", "an engineer"),
            ("journalist", "un journaliste", "a journalist"), ("lawyer", "un avocat", "a lawyer"),
            ("shop-assistant", "un vendeur", "a shop assistant"), ("firefighter", "un pompier", "a firefighter"),
            ("apply", "postuler", "to apply"), ("earn", "gagner un salaire", "to earn"),
        ]),
        ("achats", "Achats et argent", [
            ("price", "le prix", "the price"), ("cash", "des espèces", "cash"),
            ("credit-card", "une carte bancaire", "a credit card"), ("receipt", "un reçu", "a receipt"),
            ("change", "la monnaie", "change"), ("cheap", "bon marché", "cheap"),
            ("expensive", "cher", "expensive"), ("try-on", "essayer un vêtement", "to try on"),
            ("size", "une taille", "a size"), ("how-much", "Combien cela coûte-t-il ?", "How much is it?"),
        ]),
        ("personnalite", "Personnalité", [
            ("kind", "gentil", "kind"), ("funny", "drôle", "funny"), ("brave", "courageux", "brave"),
            ("clever", "intelligent", "clever"), ("hardworking", "travailleur", "hard-working"),
            ("lazy", "paresseux", "lazy"), ("selfish", "égoïste", "selfish"),
            ("patient", "patient", "patient"), ("honest", "honnête", "honest"),
            ("curious", "curieux", "curious"),
        ]),
        ("technologie", "Technologie", [
            ("screen", "un écran", "a screen"), ("keyboard", "un clavier", "a keyboard"),
            ("mouse", "une souris", "a mouse"), ("headphones", "un casque audio", "headphones"),
            ("website", "un site web", "a website"), ("search-engine", "un moteur de recherche", "a search engine"),
            ("log-in", "se connecter", "to log in"), ("upload", "téléverser", "to upload"),
            ("save-file", "enregistrer un fichier", "to save a file"), ("device", "un appareil", "a device"),
        ]),
        ("hebergement", "Vacances et hébergement", [
            ("hotel", "un hôtel", "a hotel"), ("youth-hostel", "une auberge de jeunesse", "a youth hostel"),
            ("campsite", "un camping", "a campsite"), ("single-room", "une chambre simple", "a single room"),
            ("double-room", "une chambre double", "a double room"), ("reception", "la réception", "reception"),
            ("key", "une clé", "a key"), ("check-in", "s'enregistrer à l'arrivée", "to check in"),
            ("check-out", "libérer la chambre", "to check out"), ("available", "disponible", "available"),
        ]),
    ],
    "3e": [
        ("orientation", "Études et orientation", [
            ("subject", "une matière", "a subject"), ("grade", "une note", "a grade"),
            ("exam", "un examen", "an exam"), ("skill", "une compétence", "a skill"),
            ("degree", "un diplôme universitaire", "a degree"), ("training", "une formation", "training"),
            ("career", "une carrière", "a career"), ("internship", "un stage", "an internship"),
            ("apply-course", "s'inscrire à une formation", "to apply for a course"),
            ("graduate", "obtenir son diplôme", "to graduate"),
        ]),
        ("climat", "Climat et écologie", [
            ("global-warming", "le réchauffement climatique", "global warming"),
            ("greenhouse-gas", "un gaz à effet de serre", "a greenhouse gas"),
            ("sea-level", "le niveau de la mer", "sea level"), ("wildlife", "la faune sauvage", "wildlife"),
            ("habitat", "un habitat naturel", "a habitat"), ("endangered", "menacé", "endangered"),
            ("protect", "protéger", "to protect"), ("waste-energy", "gaspiller de l'énergie", "to waste energy"),
            ("public-transport", "les transports en commun", "public transport"),
            ("take-action", "agir", "to take action"),
        ]),
        ("travail", "Monde du travail", [
            ("job", "un emploi", "a job"), ("employer", "un employeur", "an employer"),
            ("employee", "un salarié", "an employee"), ("salary", "un salaire", "a salary"),
            ("working-hours", "les horaires de travail", "working hours"), ("colleague", "un collègue", "a colleague"),
            ("experience", "de l'expérience", "experience"), ("job-interview", "un entretien d'embauche", "a job interview"),
            ("part-time", "à temps partiel", "part-time"), ("full-time", "à temps plein", "full-time"),
        ]),
        ("experiences", "Voyages et expériences", [
            ("abroad", "à l'étranger", "abroad"), ("journey", "un trajet", "a journey"),
            ("trip", "un voyage court", "a trip"), ("landmark", "un monument célèbre", "a landmark"),
            ("guidebook", "un guide touristique", "a guidebook"), ("sightseeing", "faire du tourisme", "to go sightseeing"),
            ("discover", "découvrir", "to discover"), ("experience-abroad", "vivre une expérience à l'étranger", "to experience life abroad"),
            ("host-family", "une famille d'accueil", "a host family"), ("exchange", "un échange scolaire", "a school exchange"),
        ]),
        ("justice", "Justice et sécurité", [
            ("crime", "un crime", "a crime"), ("criminal", "un criminel", "a criminal"),
            ("victim", "une victime", "a victim"), ("witness", "un témoin", "a witness"),
            ("evidence", "une preuve", "evidence"), ("police-officer", "un policier", "a police officer"),
            ("court", "un tribunal", "a court"), ("judge", "un juge", "a judge"),
            ("guilty", "coupable", "guilty"), ("innocent", "innocent", "innocent"),
        ]),
    ],
    "2de": [
        ("exploration", "Voyages et exploration", [
            ("expedition", "une expédition", "an expedition"), ("settler", "un colon", "a settler"),
            ("indigenous", "autochtone", "Indigenous"), ("remote", "isolé", "remote"),
            ("wilderness", "une région sauvage", "the wilderness"), ("charted", "cartographié", "charted"),
            ("set-off", "partir", "to set off"), ("reach", "atteindre", "to reach"),
            ("overcome-obstacle", "surmonter un obstacle", "to overcome an obstacle"),
            ("unknown", "l'inconnu", "the unknown"),
        ]),
        ("mondes-virtuels", "Citoyenneté et mondes virtuels", [
            ("online-community", "une communauté en ligne", "an online community"),
            ("digital-footprint", "une empreinte numérique", "a digital footprint"),
            ("privacy-settings", "les paramètres de confidentialité", "privacy settings"),
            ("user", "un utilisateur", "a user"), ("content", "du contenu", "content"),
            ("moderate", "modérer", "to moderate"), ("report-content", "signaler un contenu", "to report content"),
            ("harassment", "le harcèlement", "harassment"), ("access", "avoir accès à", "to have access to"),
            ("responsible-use", "un usage responsable", "responsible use"),
        ]),
        ("memoire", "Mémoire et patrimoine", [
            ("memorial", "un monument commémoratif", "a memorial"), ("archive", "des archives", "archives"),
            ("testimony", "un témoignage", "a testimony"), ("ancestor", "un ancêtre", "an ancestor"),
            ("generation", "une génération", "a generation"), ("collective-memory", "la mémoire collective", "collective memory"),
            ("preserve", "préserver", "to preserve"), ("remember", "se souvenir", "to remember"),
            ("honour", "rendre hommage à", "to honour"), ("pass-down", "transmettre", "to pass down"),
        ]),
        ("competition", "Sport et compétition", [
            ("athlete", "un athlète", "an athlete"), ("coach", "un entraîneur", "a coach"),
            ("opponent", "un adversaire", "an opponent"), ("referee", "un arbitre", "a referee"),
            ("achievement", "une réussite", "an achievement"), ("fair-play", "le fair-play", "fair play"),
            ("defeat", "une défaite", "a defeat"), ("draw-match", "un match nul", "a draw"),
            ("compete", "concourir", "to compete"), ("break-record", "battre un record", "to break a record"),
        ]),
        ("territoires", "Ville et territoires", [
            ("suburb", "une banlieue résidentielle", "a suburb"), ("inner-city", "le centre-ville défavorisé", "the inner city"),
            ("neighbourhood", "un quartier", "a neighbourhood"), ("housing", "le logement", "housing"),
            ("public-space", "un espace public", "a public space"), ("commuter", "un navetteur", "a commuter"),
            ("urban-sprawl", "l'étalement urbain", "urban sprawl"), ("regenerate", "réhabiliter", "to regenerate"),
            ("settle-area", "s'installer dans une région", "to settle in an area"),
            ("sense-place", "le sentiment d'appartenance à un lieu", "a sense of place"),
        ]),
    ],
    "1re": [
        ("pouvoir-contestation", "Pouvoir et contestation", [
            ("authority", "l'autorité", "authority"), ("protest", "une manifestation", "a protest"),
            ("demonstrator", "un manifestant", "a demonstrator"), ("civil-disobedience", "la désobéissance civile", "civil disobedience"),
            ("oppression", "l'oppression", "oppression"), ("resistance", "la résistance", "resistance"),
            ("challenge-authority", "contester l'autorité", "to challenge authority"),
            ("speak-out", "prendre publiquement position", "to speak out"), ("ban", "interdire", "to ban"),
            ("grant-right", "accorder un droit", "to grant a right"),
        ]),
        ("litterature", "Analyse littéraire", [
            ("plot", "l'intrigue", "the plot"), ("setting", "le cadre spatio-temporel", "the setting"),
            ("narrator", "le narrateur", "the narrator"), ("character", "un personnage", "a character"),
            ("theme", "un thème", "a theme"), ("tone", "le ton", "the tone"),
            ("metaphor", "une métaphore", "a metaphor"), ("foreshadow", "annoncer la suite", "to foreshadow"),
            ("portray-character", "dépeindre un personnage", "to portray a character"),
            ("first-person", "un récit à la première personne", "a first-person narrative"),
        ]),
        ("science-progres", "Science et progrès", [
            ("research", "la recherche", "research"), ("finding", "un résultat de recherche", "a finding"),
            ("trial", "un essai", "a trial"), ("discovery", "une découverte", "a discovery"),
            ("device", "un dispositif", "a device"), ("reliable", "fiable", "reliable"),
            ("accurate", "précis", "accurate"), ("carry-out", "mener une expérience", "to carry out an experiment"),
            ("raise-concern", "susciter une inquiétude", "to raise concern"),
            ("scientific-evidence", "des preuves scientifiques", "scientific evidence"),
        ]),
        ("economie-travail", "Économie et travail", [
            ("workforce", "la population active", "the workforce"), ("unemployment", "le chômage", "unemployment"),
            ("income", "un revenu", "an income"), ("living-wage", "un salaire décent", "a living wage"),
            ("working-condition", "une condition de travail", "a working condition"),
            ("trade-union", "un syndicat", "a trade union"), ("strike-action", "une grève", "a strike"),
            ("hire", "embaucher", "to hire"), ("dismiss", "licencier", "to dismiss"),
            ("make-living", "gagner sa vie", "to make a living"),
        ]),
        ("action-environnementale", "Action environnementale", [
            ("campaigner", "un militant", "a campaigner"), ("conservation", "la protection de la nature", "conservation"),
            ("emission", "une émission de gaz", "an emission"), ("net-zero", "la neutralité carbone", "net zero"),
            ("greenwashing", "l'écoblanchiment", "greenwashing"), ("policy-change", "un changement de politique", "a policy change"),
            ("phase-out", "supprimer progressivement", "to phase out"), ("curb", "freiner", "to curb"),
            ("hold-accountable", "demander des comptes à", "to hold accountable"),
            ("environmental-impact", "l'impact environnemental", "the environmental impact"),
        ]),
    ],
    "Terminale": [
        ("democratie", "Démocratie et institutions", [
            ("ballot", "un bulletin de vote", "a ballot"), ("turnout", "la participation électorale", "turnout"),
            ("constituency", "une circonscription", "a constituency"), ("lawmaker", "un législateur", "a lawmaker"),
            ("judiciary", "le pouvoir judiciaire", "the judiciary"), ("rule-of-law", "l'État de droit", "the rule of law"),
            ("checks-balances", "la séparation et l'équilibre des pouvoirs", "checks and balances"),
            ("pass-law", "adopter une loi", "to pass a law"), ("overturn", "annuler une décision", "to overturn"),
            ("eligible-vote", "avoir le droit de vote", "to be eligible to vote"),
        ]),
        ("mondialisation", "Économie et mondialisation", [
            ("supply-chain", "une chaîne d'approvisionnement", "a supply chain"), ("trade", "le commerce", "trade"),
            ("tariff", "un droit de douane", "a tariff"), ("consumer", "un consommateur", "a consumer"),
            ("shareholder", "un actionnaire", "a shareholder"), ("inequality-gap", "l'écart de richesse", "the wealth gap"),
            ("outsource", "externaliser", "to outsource"), ("regulate-market", "réguler le marché", "to regulate the market"),
            ("drive-growth", "stimuler la croissance", "to drive growth"),
            ("economic-downturn", "un ralentissement économique", "an economic downturn"),
        ]),
        ("politique-climatique", "Politique climatique", [
            ("carbon-tax", "une taxe carbone", "a carbon tax"), ("emission-target", "un objectif d'émissions", "an emissions target"),
            ("climate-justice", "la justice climatique", "climate justice"), ("adaptation", "l'adaptation", "adaptation"),
            ("mitigation", "l'atténuation", "mitigation"), ("loss-damage", "les pertes et préjudices", "loss and damage"),
            ("binding", "contraignant", "binding"), ("pledge", "s'engager à", "to pledge"),
            ("meet-target", "atteindre un objectif", "to meet a target"), ("bear-cost", "supporter le coût", "to bear the cost"),
        ]),
        ("diversite", "Identité et diversité", [
            ("minority", "une minorité", "a minority"), ("representation", "la représentation", "representation"),
            ("stereotype", "un stéréotype", "a stereotype"), ("intersectionality", "l'intersectionnalité", "intersectionality"),
            ("discrimination", "la discrimination", "discrimination"), ("equal-opportunity", "l'égalité des chances", "equal opportunity"),
            ("marginalise", "marginaliser", "to marginalise"), ("empower", "donner les moyens d'agir", "to empower"),
            ("challenge-stereotype", "remettre en cause un stéréotype", "to challenge a stereotype"),
            ("inclusive", "inclusif", "inclusive"),
        ]),
        ("verite-information", "Vérité et information", [
            ("misinformation", "une information erronée", "misinformation"),
            ("disinformation", "une désinformation volontaire", "disinformation"),
            ("fact-checker", "un vérificateur de faits", "a fact-checker"), ("source-bias", "le biais d'une source", "source bias"),
            ("echo-chamber", "une chambre d'écho", "an echo chamber"), ("deepfake", "un hypertrucage", "a deepfake"),
            ("verify-claim", "vérifier une affirmation", "to verify a claim"), ("debunk", "démentir", "to debunk"),
            ("distort", "déformer", "to distort"), ("media-literacy", "l'éducation aux médias", "media literacy"),
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

EXTRA_CULTURE = {
    "6e": ("fetes-symboles", "Fêtes et symboles", [
        ("Quand célèbre-t-on Christmas Day ?", "On 25 December."),
        ("Quelle fête est associée aux œufs et au lapin ?", "Easter."),
        ("Quelle fête célèbre-t-on le 14 février ?", "Valentine's Day."),
        ("Quelle fête irlandaise a lieu le 17 mars ?", "Saint Patrick's Day."),
        ("Quelle fête américaine a lieu le quatrième jeudi de novembre ?", "Thanksgiving."),
        ("Quelle fête britannique a lieu le 5 novembre ?", "Bonfire Night / Guy Fawkes Night."),
        ("Quel animal symbolise souvent les États-Unis ?", "The bald eagle."),
        ("Quelle plante symbolise l'Angleterre ?", "The rose."),
        ("Quelle plante symbolise l'Écosse ?", "The thistle."),
        ("Quelle feuille symbolise le Canada ?", "The maple leaf."),
    ]),
    "5e": ("etats-unis", "États-Unis : géographie et monuments", [
        ("Combien les États-Unis comptent-ils d'États ?", "Fifty states."),
        ("New York est-elle la capitale fédérale ?", "No. The federal capital is Washington, D.C."),
        ("Sur quelle île se trouve la Statue of Liberty ?", "Liberty Island, in New York Harbor."),
        ("Dans quel État se trouve principalement le Grand Canyon ?", "Arizona."),
        ("Quel grand fleuve traverse le centre des États-Unis ?", "The Mississippi River."),
        ("Dans quelle ville se trouve Hollywood ?", "Los Angeles."),
        ("Que reliait historiquement Route 66 ?", "Chicago and the Los Angeles area."),
        ("Quel fut le premier parc national des États-Unis ?", "Yellowstone National Park."),
        ("Quel est le plus grand État américain par sa superficie ?", "Alaska."),
        ("Dans quel océan se trouve Hawaii ?", "The Pacific Ocean."),
    ]),
    "4e": ("peuples-paysages", "Peuples autochtones et paysages", [
        ("Quels peuples autochtones vivent en Australie ?", "Aboriginal and Torres Strait Islander peoples."),
        ("Quel peuple autochtone est associé à Aotearoa New Zealand ?", "The Māori."),
        ("Quels sont les trois groupes autochtones reconnus au Canada ?", "First Nations, Inuit and Métis."),
        ("Quel monolithe sacré se trouve au centre de l'Australie ?", "Uluru."),
        ("Quel récif corallien se trouve au large du Queensland ?", "The Great Barrier Reef."),
        ("Quelle chaîne de montagnes traverse l'ouest du Canada ?", "The Rocky Mountains."),
        ("À la frontière de quels pays se trouvent les chutes du Niagara ?", "Canada and the United States."),
        ("Qu'est-ce qu'un haka ?", "A Māori ceremonial performance."),
        ("Quel traité fut signé à Waitangi en 1840 ?", "The Treaty of Waitangi."),
        ("Que désigne the Dreaming dans les cultures aborigènes ?", "A complex system of beliefs, creation stories and connections to Country."),
    ]),
    "3e": ("migrations-mouvements", "Migrations et mouvements sociaux", [
        ("À quoi servait Ellis Island ?", "It was a major immigration inspection station in New York Harbor."),
        ("Qu'était the Underground Railroad ?", "A network that helped enslaved people escape to freedom."),
        ("Quel mouvement suivit l'arrestation de Rosa Parks ?", "The Montgomery Bus Boycott."),
        ("Quel amendement abolit l'esclavage aux États-Unis ?", "The Thirteenth Amendment."),
        ("Quel amendement garantit le droit de vote des femmes aux États-Unis ?", "The Nineteenth Amendment."),
        ("Quel événement de 1969 est un repère du mouvement LGBTQ+ ?", "The Stonewall uprising."),
        ("Que désigne the Windrush generation ?", "Caribbean people who migrated to the UK after the Second World War."),
        ("Qu'était apartheid en Afrique du Sud ?", "A system of institutionalised racial segregation."),
        ("En quelle année Black Lives Matter a-t-il été fondé ?", "In 2013."),
        ("Que réclamaient les suffragettes ?", "Voting rights for women."),
    ]),
    "2de": ("villes-territoires", "Villes et territoires anglophones", [
        ("Quelle ville britannique est liée à la révolution industrielle et au textile ?", "Manchester."),
        ("Dans quelle ville fut construit le Titanic ?", "Belfast."),
        ("Où se trouve Silicon Valley ?", "In the San Francisco Bay Area, California."),
        ("Que désigne the Rust Belt ?", "A formerly industrial region of the northeastern and midwestern United States."),
        ("Que désigne the Sun Belt ?", "The southern and southwestern region of the United States."),
        ("Quels sont les cinq boroughs de New York ?", "Manhattan, Brooklyn, Queens, the Bronx and Staten Island."),
        ("Pourquoi Washington, D.C. n'appartient-elle à aucun État ?", "It is a federal district created to serve as the national capital."),
        ("Combien le Canada compte-t-il de provinces et territoires ?", "Ten provinces and three territories."),
        ("Combien l'Australie compte-t-elle d'États ?", "Six states, plus two main mainland territories."),
        ("Quelles sont les deux îles principales de la Nouvelle-Zélande ?", "The North Island and the South Island."),
    ]),
    "1re": ("sciences-innovations", "Sciences et innovations", [
        ("Quel naturaliste a développé la théorie de l'évolution par sélection naturelle ?", "Charles Darwin."),
        ("Qui est souvent considérée comme la première programmeuse ?", "Ada Lovelace."),
        ("Quel mathématicien britannique a contribué à décrypter Enigma ?", "Alan Turing."),
        ("Qui a inventé le World Wide Web ?", "Tim Berners-Lee."),
        ("Quelle scientifique a contribué à révéler la structure de l'ADN grâce aux rayons X ?", "Rosalind Franklin."),
        ("Qui a découvert la pénicilline ?", "Alexander Fleming."),
        ("À quel inventeur est associé le premier brevet américain du téléphone ?", "Alexander Graham Bell."),
        ("Quels frères ont réalisé un vol motorisé contrôlé en 1903 ?", "Orville and Wilbur Wright."),
        ("Quelle mathématicienne de la NASA a calculé des trajectoires spatiales ?", "Katherine Johnson."),
        ("Quel physicien britannique a écrit A Brief History of Time ?", "Stephen Hawking."),
    ]),
    "Terminale": ("reperes-geopolitiques", "Repères historiques et géopolitiques", [
        ("Quel texte anglais fut scellé en 1215 ?", "Magna Carta."),
        ("Quel texte de 1689 limita les pouvoirs de la monarchie anglaise ?", "The English Bill of Rights."),
        ("En quelle année la Constitution américaine fut-elle signée ?", "In 1787."),
        ("En quelle année l'Organisation des Nations unies fut-elle fondée ?", "In 1945."),
        ("En quelle année l'OTAN fut-elle créée ?", "In 1949."),
        ("Quel texte de 1949 marque la naissance du Commonwealth moderne ?", "The London Declaration."),
        ("Quand le Royaume-Uni a-t-il quitté l'Union européenne ?", "On 31 January 2020."),
        ("Quel accord de 1998 concerne l'Irlande du Nord ?", "The Good Friday Agreement."),
        ("En quelle année la Confédération canadienne fut-elle créée ?", "In 1867."),
        ("En quelle année les colonies australiennes se fédérèrent-elles ?", "In 1901."),
    ]),
}

IRREGULAR = {
    "6e": [
        ("be", "être", "was/were", "been"), ("have", "avoir", "had", "had"),
        ("do", "faire", "did", "done"), ("go", "aller", "went", "gone"),
        ("come", "venir", "came", "come"), ("get", "obtenir", "got", "got/gotten"),
        ("make", "faire, fabriquer", "made", "made"), ("say", "dire", "said", "said"),
        ("see", "voir", "saw", "seen"), ("take", "prendre", "took", "taken"),
        ("eat", "manger", "ate", "eaten"), ("drink", "boire", "drank", "drunk"),
        ("give", "donner", "gave", "given"), ("know", "savoir, connaître", "knew", "known"),
        ("read", "lire", "read", "read"), ("write", "écrire", "wrote", "written"),
        ("find", "trouver", "found", "found"), ("think", "penser", "thought", "thought"),
        ("buy", "acheter", "bought", "bought"), ("bring", "apporter", "brought", "brought"),
    ],
    "5e": [
        ("begin", "commencer", "began", "begun"), ("break", "casser", "broke", "broken"),
        ("choose", "choisir", "chose", "chosen"), ("drive", "conduire", "drove", "driven"),
        ("fall", "tomber", "fell", "fallen"), ("feel", "ressentir", "felt", "felt"),
        ("forget", "oublier", "forgot", "forgotten"), ("leave", "quitter", "left", "left"),
        ("meet", "rencontrer", "met", "met"), ("run", "courir", "ran", "run"),
        ("speak", "parler", "spoke", "spoken"), ("sleep", "dormir", "slept", "slept"),
        ("sing", "chanter", "sang", "sung"), ("sit", "s'asseoir", "sat", "sat"),
        ("stand", "être debout", "stood", "stood"), ("swim", "nager", "swam", "swum"),
        ("teach", "enseigner", "taught", "taught"), ("tell", "dire, raconter", "told", "told"),
        ("wear", "porter", "wore", "worn"), ("win", "gagner", "won", "won"),
        ("pay", "payer", "paid", "paid"), ("put", "mettre", "put", "put"),
        ("send", "envoyer", "sent", "sent"), ("build", "construire", "built", "built"),
        ("catch", "attraper", "caught", "caught"),
    ],
    "4e": [
        ("become", "devenir", "became", "become"), ("grow", "grandir, pousser", "grew", "grown"),
        ("hear", "entendre", "heard", "heard"), ("hold", "tenir", "held", "held"),
        ("lose", "perdre", "lost", "lost"), ("fight", "se battre", "fought", "fought"),
        ("fly", "voler", "flew", "flown"), ("ride", "monter, faire du vélo", "rode", "ridden"),
        ("ring", "sonner", "rang", "rung"), ("rise", "s'élever", "rose", "risen"),
        ("sell", "vendre", "sold", "sold"), ("show", "montrer", "showed", "shown"),
        ("shut", "fermer", "shut", "shut"), ("spend", "dépenser, passer", "spent", "spent"),
        ("steal", "voler, dérober", "stole", "stolen"), ("throw", "jeter", "threw", "thrown"),
        ("understand", "comprendre", "understood", "understood"), ("wake", "se réveiller", "woke", "woken"),
        ("draw", "dessiner", "drew", "drawn"), ("cut", "couper", "cut", "cut"),
        ("hit", "frapper", "hit", "hit"), ("hurt", "blesser", "hurt", "hurt"),
        ("keep", "garder", "kept", "kept"), ("let", "laisser", "let", "let"),
        ("mean", "signifier", "meant", "meant"),
    ],
    "3e": [
        ("bite", "mordre", "bit", "bitten"), ("blow", "souffler", "blew", "blown"),
        ("burn", "brûler", "burned/burnt", "burned/burnt"), ("cost", "coûter", "cost", "cost"),
        ("dream", "rêver", "dreamed/dreamt", "dreamed/dreamt"), ("feed", "nourrir", "fed", "fed"),
        ("hide", "cacher", "hid", "hidden"), ("lay", "poser à plat", "laid", "laid"),
        ("lead", "mener", "led", "led"), ("learn", "apprendre", "learned/learnt", "learned/learnt"),
        ("lend", "prêter", "lent", "lent"), ("lie", "être allongé", "lay", "lain"),
        ("light", "allumer", "lit/lighted", "lit/lighted"), ("shake", "secouer", "shook", "shaken"),
        ("shoot", "tirer", "shot", "shot"), ("smell", "sentir", "smelled/smelt", "smelled/smelt"),
        ("spell", "épeler", "spelled/spelt", "spelled/spelt"), ("stick", "coller", "stuck", "stuck"),
        ("sweep", "balayer", "swept", "swept"), ("tear", "déchirer", "tore", "torn"),
        ("freeze", "geler", "froze", "frozen"), ("deal", "traiter", "dealt", "dealt"),
        ("dig", "creuser", "dug", "dug"), ("hang", "suspendre", "hung", "hung"),
        ("bleed", "saigner", "bled", "bled"),
        ("lean", "se pencher", "leaned/leant", "leaned/leant"),
        ("leap", "bondir", "leaped/leapt", "leaped/leapt"), ("spit", "cracher", "spat/spit", "spat/spit"),
        ("wind", "enrouler", "wound", "wound"), ("wet", "mouiller", "wet/wetted", "wet/wetted"),
    ],
    "2de": [
        ("arise", "survenir", "arose", "arisen"), ("bear", "porter, supporter", "bore", "borne/born"),
        ("beat", "battre", "beat", "beaten"), ("bend", "plier", "bent", "bent"),
        ("bet", "parier", "bet", "bet"), ("bind", "lier", "bound", "bound"),
        ("breed", "élever, se reproduire", "bred", "bred"), ("burst", "éclater", "burst", "burst"),
        ("flee", "fuir", "fled", "fled"), ("forgive", "pardonner", "forgave", "forgiven"),
        ("seek", "chercher", "sought", "sought"), ("set", "placer, régler", "set", "set"),
        ("shine", "briller", "shone", "shone"), ("sink", "couler", "sank", "sunk"),
        ("slide", "glisser", "slid", "slid"), ("spread", "répandre", "spread", "spread"),
        ("strike", "frapper", "struck", "struck/stricken"), ("swear", "jurer", "swore", "sworn"),
        ("swing", "se balancer", "swung", "swung"), ("weep", "pleurer", "wept", "wept"),
        ("withdraw", "retirer", "withdrew", "withdrawn"), ("withstand", "résister à", "withstood", "withstood"),
        ("overcome", "surmonter", "overcame", "overcome"), ("undertake", "entreprendre", "undertook", "undertaken"),
        ("mistake", "confondre", "mistook", "mistaken"),
        ("fit", "convenir, aller", "fit/fitted", "fit/fitted"),
        ("string", "enfiler, tendre", "strung", "strung"), ("thrust", "pousser brusquement", "thrust", "thrust"),
    ],
    "1re": [
        ("awake", "s'éveiller", "awoke", "awoken"), ("cast", "jeter, distribuer un rôle", "cast", "cast"),
        ("cling", "s'agripper", "clung", "clung"), ("creep", "ramper", "crept", "crept"),
        ("forbid", "interdire", "forbade", "forbidden"), ("forecast", "prévoir", "forecast", "forecast"),
        ("foresee", "prévoir", "foresaw", "foreseen"), ("grind", "moudre", "ground", "ground"),
        ("kneel", "s'agenouiller", "knelt/kneeled", "knelt/kneeled"), ("knit", "tricoter", "knitted/knit", "knitted/knit"),
        ("mislead", "induire en erreur", "misled", "misled"), ("overtake", "dépasser", "overtook", "overtaken"),
        ("prove", "prouver", "proved", "proven/proved"), ("quit", "quitter", "quit", "quit"),
        ("shed", "répandre, perdre", "shed", "shed"), ("shrink", "rétrécir", "shrank", "shrunk"),
        ("spin", "tourner, filer", "spun", "spun"), ("split", "diviser", "split", "split"),
        ("spring", "bondir, jaillir", "sprang", "sprung"), ("sting", "piquer", "stung", "stung"),
        ("stink", "sentir mauvais", "stank/stunk", "stunk"), ("strive", "s'efforcer", "strove", "striven"),
        ("tread", "marcher sur", "trod", "trodden/trod"), ("undergo", "subir", "underwent", "undergone"),
        ("upset", "bouleverser", "upset", "upset"),
        ("forego", "renoncer à", "forewent", "foregone"), ("stride", "marcher à grands pas", "strode", "stridden"),
    ],
    "Terminale": [
        ("abide", "respecter, supporter", "abode/abided", "abode/abided"),
        ("befall", "arriver à", "befell", "befallen"), ("behold", "contempler", "beheld", "beheld"),
        ("bereave", "endeuiller", "bereaved/bereft", "bereaved/bereft"),
        ("beseech", "supplier", "besought/beseeched", "besought/beseeched"),
        ("bid", "enchérir", "bid", "bid"), ("broadcast", "diffuser", "broadcast", "broadcast"),
        ("dwell", "habiter, s'attarder", "dwelt/dwelled", "dwelt/dwelled"),
        ("fling", "lancer violemment", "flung", "flung"), ("foretell", "prédire", "foretold", "foretold"),
        ("forsake", "abandonner", "forsook", "forsaken"), ("mow", "tondre", "mowed", "mown/mowed"),
        ("plead", "plaider", "pleaded/pled", "pleaded/pled"), ("rid", "débarrasser", "rid", "rid"),
        ("saw", "scier", "sawed", "sawn/sawed"), ("sew", "coudre", "sewed", "sewn/sewed"),
        ("sling", "lancer, suspendre", "slung", "slung"), ("slit", "fendre", "slit", "slit"),
        ("sow", "semer", "sowed", "sown/sowed"), ("speed", "aller vite", "sped/speeded", "sped/speeded"),
        ("spill", "renverser", "spilled/spilt", "spilled/spilt"),
        ("spoil", "gâcher", "spoiled/spoilt", "spoiled/spoilt"),
        ("swell", "gonfler", "swelled", "swollen/swelled"), ("weave", "tisser", "wove", "woven"),
        ("wring", "tordre", "wrung", "wrung"),
        ("alight", "descendre, se poser", "alighted/alit", "alighted/alit"),
        ("beget", "engendrer", "begot", "begotten"), ("beset", "assaillir", "beset", "beset"),
        ("slay", "tuer", "slew", "slain"), ("smite", "frapper violemment", "smote", "smitten"),
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

EXTRA_GRAMMAR = {
    "6e": [
        ("articles-pluriels", "Articles, démonstratifs et pluriels", [
            ("a-an", "Choisis : a / an orange.", "an orange"),
            ("the", "Complète : Close ___ door, please.", "Close the door, please."),
            ("no-article", "Complète si nécessaire : I like ___ chocolate.", "I like chocolate: pas d'article pour une généralité."),
            ("this", "Complète pour un objet proche : ___ book.", "this book"),
            ("that", "Complète pour un objet éloigné : ___ house.", "that house"),
            ("these", "Donne le pluriel de this child.", "these children"),
            ("those", "Donne le pluriel de that box.", "those boxes"),
            ("plural-s", "Donne le pluriel de cat.", "cats"),
            ("plural-es", "Donne le pluriel de watch.", "watches"),
            ("plural-y", "Donne le pluriel de baby.", "babies"),
        ]),
        ("possessifs-prepositions", "Possessifs, prépositions et impératif", [
            ("my", "Complète : I have a bag. It is ___ bag.", "It is my bag."),
            ("your", "Traduis : « Où est ton livre ? »", "Where is your book?"),
            ("his-her", "Complète : Tom has a bike. Emma has a scooter. ___ bike and ___ scooter.", "his bike and her scooter"),
            ("our", "Traduis : « Voici notre maison. »", "This is our house."),
            ("their", "Traduis : « Leurs parents sont ici. »", "Their parents are here."),
            ("in", "Traduis : « dans la boîte ».", "in the box"),
            ("on", "Traduis : « sur la table ».", "on the table"),
            ("under", "Traduis : « sous la chaise ».", "under the chair"),
            ("imperative", "Donne l'ordre : « Ouvre ton livre. »", "Open your book."),
            ("negative-imperative", "Donne l'interdiction : « Ne cours pas. »", "Don't run."),
        ]),
    ],
    "5e": [
        ("preterit-introduction", "Introduction au prétérit", [
            ("was", "Complète : I ___ at home yesterday.", "I was at home yesterday."),
            ("were", "Complète : They ___ happy.", "They were happy."),
            ("wasnt", "Mets à la forme négative : She was late.", "She wasn't late."),
            ("were-question", "Transforme en question : You were tired.", "Were you tired?"),
            ("regular-ed", "Mets au passé : We visit London.", "We visited London."),
            ("regular-y", "Mets au passé : She studies English.", "She studied English."),
            ("didnt", "Mets à la forme négative : He played tennis.", "He didn't play tennis."),
            ("did-question", "Transforme en question : They watched the film.", "Did they watch the film?"),
            ("yesterday", "Où place-t-on yesterday : I went to town ?", "I went to town yesterday."),
            ("short-answer", "Réponds brièvement : Did you enjoy it? (oui)", "Yes, I did."),
        ]),
        ("possession-lieu", "Possession, pronoms et lieu", [
            ("genitive", "Traduis : « le vélo de Tom ».", "Tom's bike"),
            ("plural-genitive", "Traduis : « la salle des professeurs ».", "the teachers' room"),
            ("mine", "Complète : This book is my book. It is ___.", "It is mine."),
            ("yours", "Traduis : « Est-ce que ce sac est à toi ? »", "Is this bag yours?"),
            ("object-him", "Remplace Tom : I can see Tom.", "I can see him."),
            ("object-them", "Remplace my friends : I called my friends.", "I called them."),
            ("there-is", "Traduis : « Il y a un parc. »", "There is a park."),
            ("there-are", "Traduis : « Il y a deux magasins. »", "There are two shops."),
            ("between", "Traduis : « entre la banque et la gare ».", "between the bank and the station"),
            ("behind", "Traduis : « derrière la mairie ».", "behind the town hall"),
        ]),
    ],
    "4e": [
        ("present-perfect-introduction", "Introduction au present perfect", [
            ("form-have", "Complète : I ___ finished.", "I have finished."),
            ("form-has", "Complète : She ___ arrived.", "She has arrived."),
            ("negative", "Mets à la forme négative : He has seen it.", "He hasn't seen it."),
            ("question", "Transforme en question : You have visited London.", "Have you visited London?"),
            ("ever", "Traduis : « As-tu déjà mangé cela ? »", "Have you ever eaten that?"),
            ("never", "Traduis : « Je n'ai jamais pris l'avion. »", "I have never flown."),
            ("just", "Traduis : « Nous venons d'arriver. »", "We have just arrived."),
            ("already", "Traduis : « Elle a déjà fini. »", "She has already finished."),
            ("yet", "Traduis : « Ils ne sont pas encore partis. »", "They haven't left yet."),
            ("experience", "Choisis le temps : I went / have been to Ireland twice.", "I have been to Ireland twice."),
        ]),
        ("relatives-gerondif", "Relatives et formes en -ing", [
            ("who", "Complète : The man ___ lives here is Irish.", "The man who lives here is Irish."),
            ("which", "Complète : The bus ___ goes downtown is late.", "The bus which/that goes downtown is late."),
            ("where", "Complète : This is the hotel ___ we stayed.", "This is the hotel where we stayed."),
            ("whose", "Complète : The girl ___ bag is red is my friend.", "The girl whose bag is red is my friend."),
            ("like-ing", "Complète : I enjoy ___. (read)", "I enjoy reading."),
            ("good-at", "Traduis : « Elle est douée en dessin. »", "She is good at drawing."),
            ("before-ing", "Traduis : « avant de partir ».", "before leaving"),
            ("after-ing", "Traduis : « après avoir mangé ».", "after eating"),
            ("stop-ing", "Traduis : « Arrête de parler. »", "Stop talking."),
            ("go-ing", "Complète : Let's go ___. (swim)", "Let's go swimming."),
        ]),
    ],
    "3e": [
        ("passif-relatives", "Voix passive et relatives", [
            ("passive-present", "Mets au passif : People speak English here.", "English is spoken here."),
            ("passive-past", "Mets au passif : They built it in 1920.", "It was built in 1920."),
            ("passive-agent", "Mets au passif : Shakespeare wrote Hamlet.", "Hamlet was written by Shakespeare."),
            ("passive-negative", "Mets au passif : They do not allow phones.", "Phones are not allowed."),
            ("passive-question", "Mets au passif : Do they grow tea here?", "Is tea grown here?"),
            ("who", "Complète : The activist ___ spoke was convincing.", "The activist who spoke was convincing."),
            ("which", "Complète : The film ___ won is British.", "The film which/that won is British."),
            ("whose", "Complète : The author ___ book I read is Canadian.", "The author whose book I read is Canadian."),
            ("where", "Complète : This is the city ___ she was born.", "This is the city where she was born."),
            ("omit", "Peut-on omettre that : The book that I bought ?", "Oui : The book I bought. Le pronom est complément."),
        ]),
        ("past-perfect-discours", "Past perfect et discours indirect", [
            ("past-perfect", "Complète : When I arrived, they ___. (leave)", "When I arrived, they had left."),
            ("negative", "Traduis : « Je n'avais jamais vu la mer. »", "I had never seen the sea."),
            ("question", "Traduis : « Avait-elle déjà terminé ? »", "Had she already finished?"),
            ("before", "Relie : He ate. Then he left.", "After he had eaten, he left."),
            ("reported-be", "Rapporte : She said, “I am ready.”", "She said that she was ready."),
            ("reported-present", "Rapporte : He said, “I live here.”", "He said that he lived there."),
            ("reported-will", "Rapporte : She said, “I will come.”", "She said that she would come."),
            ("reported-can", "Rapporte : He said, “I can swim.”", "He said that he could swim."),
            ("said-told", "Complète : She ___ me that she agreed.", "She told me that she agreed."),
            ("time-change", "Dans un récit au passé, que devient tomorrow ?", "the next day / the following day"),
        ]),
    ],
    "2de": [
        ("conditionnels", "Conditionnels présent et irréel", [
            ("zero", "Complète : If water reaches 0°C, it ___. (freeze)", "If water reaches 0°C, it freezes."),
            ("first", "Complète : If we act now, emissions ___. (fall)", "If we act now, emissions will fall."),
            ("first-modal", "Complète : If you finish, you ___ leave. (can)", "If you finish, you can leave."),
            ("unless", "Reformule avec unless : If we don't act, it will worsen.", "Unless we act, it will worsen."),
            ("second", "Complète : If I ___ you, I would wait. (be)", "If I were you, I would wait."),
            ("second-result", "Complète : If she had time, she ___ more. (travel)", "If she had time, she would travel more."),
            ("could", "Traduis : « Si nous avions plus d'argent, nous pourrions aider. »", "If we had more money, we could help."),
            ("wish", "Traduis : « J'aimerais être plus sûr de moi. »", "I wish I were more confident."),
            ("as-if", "Traduis : « Il parle comme s'il savait tout. »", "He talks as if he knew everything."),
            ("difference", "Quelle différence entre le premier et le deuxième conditionnel ?", "Le premier envisage un possible réel ; le deuxième une hypothèse irréelle ou peu probable."),
        ]),
        ("infinitif-connecteurs", "Infinitif, gérondif et connecteurs", [
            ("want-to", "Complète : They want ___ change things. (to)", "They want to change things."),
            ("avoid-ing", "Complète : We should avoid ___ energy. (waste)", "We should avoid wasting energy."),
            ("decide-to", "Complète : She decided ___ abroad. (study)", "She decided to study abroad."),
            ("keep-ing", "Complète : They kept ___. (protest)", "They kept protesting."),
            ("purpose", "Traduis : « afin de réduire les déchets ».", "in order to reduce waste"),
            ("because-of", "Complète : The match was cancelled ___ the rain.", "The match was cancelled because of the rain."),
            ("therefore", "Relie avec therefore : It was unsafe. They closed it.", "It was unsafe; therefore, they closed it."),
            ("however", "Relie avec however : It is costly. It is effective.", "It is costly; however, it is effective."),
            ("whereas", "Relie : One source agrees. The other disagrees.", "One source agrees, whereas the other disagrees."),
            ("in-addition", "Ajoute un argument avec un connecteur.", "In addition, … / Furthermore, …"),
        ]),
    ],
    "1re": [
        ("third-conditional", "Troisième conditionnel et souhaits", [
            ("third", "Complète : If they ___ earlier, they would have won. (act)", "If they had acted earlier, they would have won."),
            ("could-have", "Traduis : « Si j'avais su, j'aurais pu aider. »", "If I had known, I could have helped."),
            ("might-have", "Complète : If she had applied, she ___ accepted. (might)", "She might have been accepted."),
            ("wish-past", "Traduis : « J'aurais aimé avoir étudié davantage. »", "I wish I had studied more."),
            ("regret", "Traduis : « Je regrette de ne pas être venu. »", "I wish I had come. / I regret not coming."),
            ("should-have", "Traduis : « Ils auraient dû vérifier la source. »", "They should have checked the source."),
            ("shouldnt-have", "Traduis : « Elle n'aurait pas dû le publier. »", "She shouldn't have published it."),
            ("mixed", "Complète : If I had listened, I ___ the answer now. (know)", "If I had listened, I would know the answer now."),
            ("otherwise", "Relie avec otherwise : Hurry up. You will be late.", "Hurry up; otherwise, you will be late."),
            ("provided", "Traduis : « à condition que chacun participe ».", "provided that everyone takes part"),
        ]),
        ("relatives-causatif", "Relatives avancées et causatif", [
            ("non-defining", "Ajoute la ponctuation : London which is very diverse attracts millions.", "London, which is very diverse, attracts millions."),
            ("whom", "Complète formellement : The person to ___ I spoke.", "The person to whom I spoke."),
            ("whose", "Complète : A country ___ economy is growing.", "A country whose economy is growing."),
            ("whereby", "Complète : A system ___ users vote directly.", "A system whereby users vote directly."),
            ("have-done", "Traduis : « J'ai fait réparer mon téléphone. »", "I had my phone repaired."),
            ("get-done", "Traduis : « Elle va se faire couper les cheveux. »", "She is going to get her hair cut."),
            ("make", "Traduis : « Ils nous ont obligés à attendre. »", "They made us wait."),
            ("let", "Traduis : « Ils nous ont laissé partir. »", "They let us leave."),
            ("allow", "Mets au passif : They allowed us to enter.", "We were allowed to enter."),
            ("reduced-relative", "Réduis : Students who live abroad…", "Students living abroad…"),
        ]),
    ],
    "Terminale": [
        ("passif-reporting", "Passif et structures de discours", [
            ("reporting-passive", "Reformule : People say that the policy works.", "The policy is said to work."),
            ("past-reporting", "Reformule : People believe that he lied.", "He is believed to have lied."),
            ("get-passive", "Traduis : « Il s'est fait licencier. »", "He got fired."),
            ("have-something-done", "Traduis : « Ils ont fait vérifier les données. »", "They had the data checked."),
            ("passive-gerund", "Mets au passif : I dislike people interrupting me.", "I dislike being interrupted."),
            ("report-verb", "Rapporte avec deny : “I didn't leak it,” she said.", "She denied leaking it."),
            ("accuse", "Rapporte avec accuse : “You lied,” he said to her.", "He accused her of lying."),
            ("urge", "Rapporte avec urge : “Act now,” they told the government.", "They urged the government to act."),
            ("claim", "Traduis : « Il prétend avoir trouvé une solution. »", "He claims to have found a solution."),
            ("seem", "Traduis : « La mesure semble avoir échoué. »", "The measure seems to have failed."),
        ]),
        ("discours-formel", "Discours formel et articulation", [
            ("nominalise-decide", "Nominalise : The committee decided to intervene.", "The committee's decision to intervene…"),
            ("nominalise-fail", "Nominalise : The policy failed.", "The failure of the policy…"),
            ("owing-to", "Traduis : « en raison d'un manque de preuves ».", "owing to a lack of evidence"),
            ("notwithstanding", "Traduis : « malgré ces limites » dans un registre formel.", "notwithstanding these limitations"),
            ("insofar", "Traduis : « dans la mesure où cela protège les citoyens ».", "insofar as it protects citizens"),
            ("thereby", "Relie : It reduced costs. It improved access.", "It reduced costs, thereby improving access."),
            ("given-that", "Traduis : « étant donné que les preuves sont limitées ».", "given that the evidence is limited"),
            ("on-balance", "Introduis une conclusion équilibrée.", "On balance, …"),
            ("to-extent", "Nuance : « Cela est vrai dans une certaine mesure. »", "This is true to a certain extent."),
            ("far-from", "Traduis : « Loin de résoudre le problème, cela l'aggrave. »", "Far from solving the problem, it makes it worse."),
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


def vocab_parts(entry):
    if len(entry) == 2:
        french, english = entry
        return slugify(english), french_label(french), english
    card_id, french, english = entry
    return card_id, french, english


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
        for topic_id, topic_title, entries in [*VOCAB[level], *EXTRA_VOCAB[level]]:
            vocab_name = f"{prefix}-vocab-{topic_id}"
            vocab_id = f"anglais-{vocab_name}"
            vocab = deck_base(
                level, vocab_id, f"Vocabulaire · {topic_title}",
                f"Liste de vocabulaire — {topic_title.lower()}.",
            )
            vocab["category"] = "vocabulary"
            vocab["cards"] = [
                {
                    "id": card_id,
                    "kind": "vocabulaire",
                    "front": f"Traduis en anglais : « {french} ».",
                    "back": english,
                }
                for card_id, french, english in map(vocab_parts, entries)
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
                    "id": card_id,
                    "kind": "comprehension-orale",
                    "front": "Écoute, puis donne le sens en français.",
                    "back": french,
                    "audio_text": english,
                }
                for card_id, french, english in map(vocab_parts, entries)
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

        extra_culture_id, extra_culture_title, extra_culture_cards = EXTRA_CULTURE[level]
        extra_culture_name = f"{prefix}-culture-{extra_culture_id}"
        extra_culture = deck_base(
            level,
            f"anglais-{extra_culture_name}",
            f"Culture · {extra_culture_title}",
            "Repères culturels du monde anglophone.",
        )
        extra_culture["category"] = "culture"
        extra_culture["cards"] = [
            {"id": f"repere-{index:02d}", "kind": "culture", "front": front, "back": back}
            for index, (front, back) in enumerate(extra_culture_cards, start=1)
        ]
        write_deck(extra_culture_name, extra_culture)
        expected.add(f"{extra_culture_name}.json")

        irregular_name = f"{prefix}-verbes-irreguliers"
        irregular = deck_base(level, f"anglais-{irregular_name}", "Verbes irréguliers", "Infinitif, prétérit, participe passé et sens français.")
        irregular["category"] = "irregular-verbs"
        irregular["cards"] = [
            {
                "id": base,
                "kind": "verbe-irregulier",
                "front": f"{base} —",
                "indice": meaning,
                "back": f"{base} · {past} · {participle}",
            }
            for base, meaning, past, participle in IRREGULAR[level]
        ]
        write_deck(irregular_name, irregular)
        expected.add(f"{irregular_name}.json")

        for grammar_id, grammar_title, grammar_cards in [*GRAMMAR[level], *EXTRA_GRAMMAR[level]]:
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
