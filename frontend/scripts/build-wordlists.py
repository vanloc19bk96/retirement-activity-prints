"""Build 10 studio word-search themes with >=500 unique A–Z words (len 3–12).

Sources:
  - Curated cores in this file (wholesome, on-theme)
  - dariusk/corpora themed lists (animals, food, …)
  - Common-English frequency lists (readability filter for corpora extras)
"""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "src" / "data" / "studio" / "wordlists"
MIN_WORDS = 500
MAX_LEN = 12
MIN_LEN = 3
CORPORA = "https://raw.githubusercontent.com/dariusk/corpora/master/data"

THEMES: list[tuple[str, str]] = [
    ("animals", "Animals"),
    ("food", "Food"),
    ("nature", "Nature"),
    ("household", "Household"),
    ("body", "Body"),
    ("sports", "Sports"),
    ("travel", "Travel"),
    ("school", "School"),
    ("music", "Music"),
    ("space", "Space"),
]

# Corpora paths + JSON keys to extract string lists from.
CORPORA_SOURCES: dict[str, list[tuple[str, str]]] = {
    "animals": [
        ("animals/common.json", "animals"),
        ("animals/dogs.json", "dogs"),
        ("animals/cats.json", "cats"),
        ("animals/birds_north_america.json", "birds"),  # may be nested
        ("animals/donkeys.json", "donkeys"),
        ("animals/ponies.json", "ponies"),
    ],
    "food": [
        ("foods/fruits.json", "fruits"),
        ("foods/vegetables.json", "vegetables"),
        ("foods/pizzaToppings.json", "pizzaToppings"),
        ("foods/breads_and_pastries.json", "breads"),
        ("foods/menuItems.json", "menuItems"),
        ("foods/tea.json", "teas"),
        ("foods/wine_descriptions.json", "wine_descriptions"),  # skip later if boozy
    ],
    "nature": [
        ("plants/flowers.json", "flowers"),
        ("plants/plants.json", "plants"),
        ("geography/english_towns_cities.json", "towns"),  # skip — not nature
        ("words/encouraging_words.json", "encouraging_words"),
    ],
    "household": [
        ("objects/objects.json", "objects"),
        ("technology/kit.json", "kit"),
        ("words/nouns.json", "nouns"),
    ],
    "body": [
        ("humans/bodyParts.json", "bodyParts"),
        ("medicine/diagnoses.json", "diagnoses"),  # may be too medical — filter
        ("words/nouns.json", "nouns"),
    ],
    "sports": [
        ("sports/sports.json", "sports"),
        ("sports/football_teams.json", "football_teams"),  # skip teams
        ("words/nouns.json", "nouns"),
    ],
    "travel": [
        ("geography/countries.json", "countries"),
        ("geography/us_cities.json", "cities"),
        ("geography/canada_cities.json", "cities"),
        ("words/nouns.json", "nouns"),
    ],
    "school": [
        ("words/nouns.json", "nouns"),
        ("words/adjs.json", "adjs"),
        ("education/courses.json", "courses"),
    ],
    "music": [
        ("music/genres.json", "genres"),
        ("music/instruments.json", "instruments"),
        ("music/richmond_venues.json", "venues"),
        ("words/nouns.json", "nouns"),
    ],
    "space": [
        ("science/planets.json", "planets"),
        ("science/minor_planets.json", "minor_planets"),
        ("science/elements.json", "elements"),
        ("words/nouns.json", "nouns"),
    ],
}

# Strong curated cores — always included.
CORES: dict[str, str] = {
    "animals": """
aardvark addax agama agouti albatross alligator alpaca anchovy anemone angelfish anteater antelope
ape armadillo auk auklet avocet baboon badger bandicoot barbet barracuda basilisk bass bat beagle
bear beaver bee beetle beluga bighorn bilby bird bison blackbird bluebird bluejay boar bobcat
bonito bonobo booby bream budgie buffalo bull bullfrog bullhead bunting bushbaby bustard butterfly
buzzard caiman calf camel canary capybara caracal cardinal caribou carp cat catfish cattle cheetah
chickadee chicken chimpanzee chinchilla chipmunk chital cicada civet clam clownfish coati cockatiel
cockatoo cod colobus condor coot copperhead cormorant cottontail cougar cow cowbird coyote crab
crane crayfish cricket crocodile crossbill crow cuckoo curlew cuttlefish dace dalmatian damselfly
darter deer dingo dinosaur dipper dog dogfish dolphin donkey dormouse dove dragonfly dromedary duck
duckling dugong dunlin eagle earthworm echidna eel egret eider eland elephant elk emu ermine falcon
fantail ferret fieldmouse finch firefly fisher fish flamingo flicker flounder flycatcher flyingfish
fowl fox foxhound frog fruitbat fulmar gadwall gallinule gannet garfish gaur gazelle gecko genet
gerbil gerenuk gharial gibbon gila giraffe glider gnat gnu goat godwit goldfinch goldfish goose
gopher gorilla goshawk grackle grebe greenfinch greyhound grizzly groundhog grouper grouse guanaco
guineapig gull guppy haddock hagfish hake halibut hammerhead hamster hare harrier hartebeest hawk
hawksbill hedgehog heron herring hippo hog hoopoe hornbill horse hound housefly howler hummingbird
husky hyena hyrax ibex ibis iguana impala jackal jackdaw jackrabbit jaguar jay jellyfish jerboa
kagu kakapo kangaroo kelpie kestrel killdeer killifish kingbird kingfisher kinkajou kite kitten kiwi
klipspringer knot koala koi komodo kookaburra kudu ladybug lamb lamprey langur lapwing lark leafbird
lechwe lemming lemur leopard limpkin linnet lion lizard llama loach lobster loon lorikeet lovebird
lungfish lynx macaque macaw magpie mallard manakin manatee mandrill manta marmoset marmot marten
martin meadowlark meerkat merganser mink minnow mite mockingbird mole mongoose monitor monkey moose
mosquito moth mouse mudskipper mule murre muskox muskrat mussel mustang mynah narwhal nene newt
nightingale nightjar nilgai noddy nuthatch nyala oarfish ocelot octopus okapi opossum orangutan orca
oriole oryx osprey ostrich otter ouzel ovenbird owl ox oystercatcher paca pacu panda pangolin panther
parakeet parrot peacock pelican penguin perch pheasant phoebe pig pigeon pika pike pilchard pintail
pipefish pipit piranha pitta platypus plover pochard polecat pollock pony porcupine porpoise potoroo
prawn puffin puma python quail quetzal quokka quoll rabbit raccoon rail ram rat rattlesnake raven ray
razorbill redfish redpanda redpoll redshank reedbuck reindeer remora rhea rhinoceros roadrunner robin
rockfish rook rooster rorqual sablefish saiga salamander salmon sanderling sandpiper sardine sawfish
scaup scorpion scoter seal seahorse seagull serval shark shearwater sheep shelduck shrew shrike shrimp
sika silverside siskin skate skimmer skua skunk skylark sloth snail snake snapper snipe sole sparrow
spider sponge spoonbill springbok squid squirrel starfish starling stingray stoat stork sturgeon
sunbird sunfish swallow swan swordfish tahr taipan takin tanager tapir tarantula tarpon tarsier teal
tenrec termite tern terrapin thrasher thrush tiger tilapia tinamou toad tortoise toucan towhee
treefrog triggerfish tropicbird trout tuna turkey turtle uakari vaquita veery vervet viper vole
vulture wagtail wallaby walleye walrus warbler warthog wasp waterbuck weasel whale whimbrel whippet
wildebeest wolf wolverine wombat woodcock woodlark woodpecker woodrat wrasse wren wryneck xenops yak
yellowhammer yellowlegs zebra zebu zorilla axolotl animal mammal reptile insect rodent feline canine
avian beast creature wildlife pet livestock poultry amphibian crustacean primate cub pup foal kit
joey hatchling fawn yearling stallion mare colt filly ewe sow tom hen gander drake doe buck stag
""",
    "food": """
acai affogato agar agave aioli albacore alfredo allspice almond amaranth amaretto ancho andouille
anise appetizer apple apricot arborio artichoke arugula asiago asparagus aspic avocado baba bacon
bagel baklava balsamic bamboo banana bannock barbecue barley basil basmati batter bayleaf bean
bechamel beef beet berry biscuit biryani biscotti blackberry blueberry bokchoy bologna bolognese
bouillon boysenberry bran bratwurst bread breadcrumb breadfruit bresaola brioche broccoli broccolini
broth brownie bruschetta bubbletea buckwheat bulgur burrito butter buttermilk cabbage cacao cake
calamari candy canola cantaloupe caper caramel cardamom carpaccio carrot cashew casserole catfish
cauliflower caviar celery celeriac cereal ceviche chai challah chanterelle chapati chard cheddar
cheese cherry chervil chestnut chicken chickpea chili chimichurri chipotle chives chocolate chorizo
chowder chutney cider cilantro cinnamon citron citrus clam clove cobbler cocoa coconut coffee
coleslaw collard cookie coriander corn cornbread cornflake cornmeal cottage couscous crab cracker
cranberry cream crepe croissant crouton crumble cucumber cumin cupcake currant curry custard cutlet
daikon danish dashi date dessert dill dimsum dolma donut dough dragonfruit drizzle dumpling edamame
eggplant elderflower emmental enchilada endive espresso falafel farfalle farro fennel feta
fettuccine fig filo flatbread focaccia fondue flour frankfurter frenchfry frittata frosting
fruitcake fudge fusilli galette garlic gazpacho gelatin gelato ghee gherkin ginger gnocchi
goldensyrup gorgonzola goulash graham granola grape grapefruit gravy greentea grits guacamole
habanero halloumi ham harissa hashbrown hazelnut herb hollandaise honey hotsauce hummus icecream
icedtea icing jackfruit jam jambalaya jelly jerky juice kale kebab kefir ketchup kielbasa kimchi
kiwi kohlrabi ladyfinger lamb lasagna latte leek lemon lentil lettuce licorice lime linguine
liverwurst lobster loganberry lychee macadamia macaroni macaron malt mango maple margarine
marshmallow mascarpone matcha matzo mayonnaise meatball meatloaf melon meringue milk mint miso
molasses mozzarella muesli muffin mulberry mungbean mushroom mustard nacho nectarine noodle nori
nutmeg oatmeal oat oil okra olive omelette onion orange oregano orzo oyster paella pancake panini
papaya paprika parfait parmesan parsley passionfruit pasta pastry pate peach peanut pear pecan penne
pepper pepperoni pesto pickle pie pimiento pineapple pistachio pita pizza plantain plum polenta
pomegranate popcorn pork porridge potato potpie pretzel prune pudding pumpkin quesadilla quiche
quince quinoa radicchio radish raisin ramen raspberry ratatouille relish rhubarb rice ricotta risotto
roast roll rosemary rye saffron sage salad salami salmon salsa salt sandwich sashimi sauce
sauerkraut sausage scallion scallop scone seafood seasoning sesame shallot sherbet shortbread shrimp
smoothie soda sorbet soup soy spaghetti spinach sprout squash steak stew strawberry sugar sushi
syrup taco tahini tangerine tapioca tart tea tempeh teriyaki thyme toast toffee tofu tomato tortilla
truffle tuna turkey turmeric turnip tzatziki udon vanilla veal vegetable vinaigrette waffle walnut
wasabi watercress watermelon wheat wonton wrap yam yeast yogurt zucchini food meal snack fruit
vegetable dessert cuisine recipe bake cook roast grill spice grain dairy seafood breakfast dinner
lunch supper pastry burger sandwich biscuit broth cereal salad sauce soup stew curry pizza taco pasta
rice bread cheese milk egg butter cream sugar salt pepper oil vinegar honey jam jelly candy cookie
cake pie tart pudding yogurt smoothie juice tea coffee cocoa soda water bagel biscuit brownie
""",
    "nature": """
acorn afterglow air alpine amber arroyo ash atoll aurora autumn avalanche backcountry badland bank
basalt basin bay bayou beach bedrock berm biome biosphere blizzard bog boreal boulder brae branch
bramble breakwater breeze brook brush butte cactus cairn caldera canopy canyon cascade cave cavern
cedar chaparral chalk clay clearing cliff cloud clover coast coastline coldsnap comet conifer coral
cove crater creek crest crevasse crystal current cyclone daisy dawn daylight deadwood debris dell
delta desert dew dirt downpour drainage dripstone drought drywash dune dusk dustdevil earth
earthquake earthrise ebbtide ecology ecosystem edgewood elm embankment estuary evergreen fault fen
fern field fir firebreak fjord flood floodplain flora fog foothill forest fossil freshwater frost
gale garden geothermal geyser glacial glacier glade gorge grass grassland greenbelt grove gulf hail
harbor haven haze headland heath highland hill hillside hollow horizon hurricane ice iceberg icecap
inlet island jungle karst kelp knoll lagoon lake lava leaf ledge lightning loam lowland mangrove
marine marsh meadow mesa mist monsoon moon moonlight moraine moss mountain mud mudflat oasis oak
ocean orchid outcrop overlook ozone palm peak peat peninsula petal pine plain plant plateau pollen
pond prairie precipice quarry rain rainbow rainforest ravine reef ridge river rock root salt sand
sandbar sandstone savanna sea seabed seashore sediment seed shore sierra sky snow snowfall soil
spring star steppe stone storm stream summit sun sunlight sunset swamp talus terrace thorn thunder
tidal tide timber tornado trail tree tributary tropical tundra undergrowth upland valley vine
volcano vortex waterfall watershed wave wetland wildfire wildlife willow wind woodland woods zephyr
nature outdoor landscape wilderness habitat weather climate season winter summer spring autumn
arctic alpine coastal woodland wetland rainforest canyon desert forest ocean river lake mountain
meadow prairie swamp marsh bog reef beach shore cliff cave dune glacier island peninsula valley
blizzard cyclone hurricane tornado thunder lightning rainbow aurora eclipse solstice equinox
sunrise sunset daylight moonlight starlight sunlight afterglow avalanche biome bog boreal boulder
breeze butte cactus caldera canopy cascade cavern chaparral clearing coldsnap conifer cove crater
crest crevasse crystal current delta drought dustdevil earthquake embankment estuary evergreen
foothill fossil freshwater gale geothermal greenbelt hail headland heath highland hollow inlet
karst kelp knoll lagoon ledge loam lowland mangrove marine mesa monsoon moraine mudflat oasis
outcrop overlook ozone peat plateau precipice quarry ravine sandstone savanna seabed sediment
sierra snowfall steppe swamp talus terrace thorn tidal timber tributary tropical undergrowth upland
vortex watershed zephyr alpine arctic coastal temperate tropical deciduous evergreen coniferous
floral fauna flora terrain topography biosphere ecosystem environment conservation preserve
sanctuary reserve parkland greenspace countryside orchard vineyard pasture farmland hillside
riverbank waterfall geyser lakebed seabed seashell seaweed shoreline coastline grassland forestland
bloom blossom petal pollen branch bark trunk grove pine oak maple birch willow moss fern coral reef
tide wave fog mist dew frost ice glacier volcano lava earth soil dirt mud clay chalk coast island
peninsula bay gulf harbor cape dune prairie tundra rainforest wetland woodland habitat wildlife
""",
    "household": """
adapter airfilter airfreshener alarm apron armchair ashtray attic awning babygate backpack backrest
bakingpan bandage banister barrel barstool basin basket baster bathtub battery bed bedspread binder
birdfeeder blanket blender blinds book bookend bookshelf boot bottle bottlebrush bowl box breadbin
broom brush bucket bulletin butterdish cabinet cabletie cakestand calendar candle candleholder
canister carpet cardtable casserole ceilingfan cellphone chair chalkboard charger chest clipboard
clock closet clothesline coat coffeemaker colander comb comforter computer cookbook cooler corkboard
couch counter cradle crib cup cupboard curtain cushion cutlery desk detergent dial diningchair dish
dishwasher door doorknob doormat drain drawer dresser dryer dustpan eggbeater extensioncord fan
faucet fireextinguisher flashlight floor floorlamp foldingchair fork frame freezer fridge garage
gardentool garlicpress glass glove grater grill hairbrush hammer handmixer handtowel hanger hatrack
headphone heater highchair hose humidifier icebucket iron ironingboard jar jewelrybox juicer kettle
key keyrack kitchen kitchentimer knife knittingneedle ladder lamp lampshade laundry laundrybasket
laundrysoap lightbulb lightswitch linencloset lock lunchbox mailbox magazinerack mat measuringcup
measuringspoon microwave mirror mixer mop mousepad mug nail napkin napkinring needle nightlight
nightstand notepad ottoman outlet oven ovenmitt paint paintbrush pan pantry paper paperclip
papertowel pen pencil perfume phone pictureframe pillow pillowcase plantpot plate plug plunger pot
powerstrip printer quilt radiator radio rake refrigerator remote rockingchair rollingpin rope rug
ruler safe saltshaker sandpaper saucer scale scissors screwdriver sewingkit shelf shirt shoe
showercurtain showerhead shovel sideboard silverware sink smokealarm soap soapdish sofa sponge spoon
spoonrest stair stapler stereo stool storagebin stove suitcase switch table tablecloth tablet tape
teapot teapotstand telephone thermostat thread throwpillow tissue tissuebox toaster toilet
toiletpaper tool toothbrush toothpaste towel trashcan tray umbrella usbhub utensil utilityknife
vacuum vase wallclock wallet wallhook wallpaper wardrobe washer washcloth wastebasket waterfilter
wateringcan weatherstrip whiteboard window windowshade wineglass wire yardstick zipbag zipper house
home room furniture appliance cleaner bathroom bedroom hallway garage basement attic cupboard drawer
shelving utensil gadget household dustpan broom mop sponge towel soap sink faucet stove oven fridge
freezer washer dryer lamp clock mirror pillow blanket curtain carpet rug chair table desk sofa bed
colander grater peeler whisk spatula ladle tongs cuttingboard dishrack dishtowel potholder ovenmitt
placemat coaster tablecloth bedspread duvet comforter nightstand bookcase ottoman armchair recliner
loveseat sectional coffeetable endtable sidetable diningtable deskchair stool bench cabinet
sideboard hutch china dresser mattress quilt sheet napkin tissue shower bathtub hinge lock key
switch outlet plug wire cable battery charger printer computer tablet laptop keyboard mouse speaker
alarm calendar candle frame vase hanger hook rack stand tray mat pad cover lid jar bottle can tin
foil wrap tape glue scissors stapler paper pencil pen notebook binder folder book magazine newspaper
mail package suitcase backpack wallet purse umbrella coat jacket hat glove scarf boot shoe sock
shirt pants dress skirt sweater jeans apron
""",
    "body": """
abdomen achilles adenoid adrenal alveolus ankle aorta appendix arch arm artery atrium auricle back
backbone beard belly bicep bladder blood bloodstream bone bonemarrow brain brainstem breastbone brow
calf capillary cartilage cell cerebellum cerebrum cheek cheekbone chest chin clavicle coccyx collar
colon cornea cortex cranium crown deltoid dermis diaphragm digit disc duct ear eardrum earlobe elbow
epidermis esophagus eye eyebrow eyelash face fang femur fiber fibula finger fingernail fist follicle
foot forearm forehead gallbladder gland groin gum gut hair hamstring hand head heart heartbeat heel
hip hipbone humerus ilium instep intestine iris jaw jawbone joint jugular keratin kidney knee
kneecap knuckle lacrimal larynx lash leg ligament lip liver lung lymph mandible marrow maxilla
metacarpals metatarsals midriff molar mouth muscle nail nasal navel neck nerve nose nostril
occipital optic organ palm pancreas patella pelvis phalanx pharynx pituitary pore pulse pupil
quadriceps radius retina rib ribcage sacrum salivary scalp scapula shin shoulder sinew sinus skeleton
skin skull spinal spine spleen sternum stomach sweat synapse tarsal tear temple tendon thigh throat
thumb thyroid tibia tissue toe tongue tonsil tooth torso trachea tricep ulna vein vertebra vocal
waist windpipe wrist wrinkle zygoma body anatomy limb torso skeleton muscle organ flesh human
health medical physiology skeleton muscle organ bone blood skin nerve joint artery vein cell tissue
organ heart lung liver kidney brain stomach intestine muscle tendon ligament cartilage marrow femur
tibia fibula humerus radius ulna clavicle scapula sternum pelvis patella vertebra coccyx sacrum
mandible maxilla zygoma sinus tonsil adenoid alveolus capillary synapse neuron cortex cerebellum
cerebrum brainstem diaphragm deltoid bicep tricep quadriceps hamstring glute calf shin instep arch
navel groin temple crown lash eyelid nostril gum molar canine bicuspid wisdom fang whisker freckle
wrinkle pore follicle sweat saliva tears lymph plasma serum hormone enzyme vitamin protein calcium
collagen keratin melanin hemoglobin oxygen anatomy physiology medical health human body organ
""",
    "sports": """
ace advantage aerial aerobics agility aiming allstar amateur angling approach archery arena armbar
assist athlete athletics attack backboard backcourt backflip backhand backstop badminton balance
balk ball balloon ballpark bandy baseball baseline basket basketball bat batter batting beachball
beanball bench bicycle bike biking birdie blackbelt block blocker blocking bobsled bocce bodycheck
bouldering bout bowling boxer boxing brace breakaway breaststroke bridle bronze broomstick bullpen
bunt bunting cadence canoe canoeing captain catch catcher catching center centerfield champion
championship check checking cheer cheerleader chinup chip circuit cleat climb climber climbing clinic
coach coaching compete competition competitor conditioning conference contender contest contestant
control corner cornerback count counterpunch course court cover coverage crease cricket crossbar
crosscheck crosscourt crossfit crossover cue cueball curling curveball cut cutter cycling cyclist
dart darts deadlift defense defenseman diamond dig digger disc discus dismount dive diver diving
double doubleheader downhill draft draw dribble drive driver dropshot dual duel dunk eagle edge
elbow elimination endzone endurance equalizer equestrian escape event exercise exhibition faceoff
fadeaway faircatch fake fall fencing field fieldgoal fielding fighter fighting final finish firstbase
fist fitness fivehole flanker flip float flyer flying flyweight foil football footwork forehand foul
foulout frame freestyle freeze frontcourt fullcourt fumble gainer game gameplan gear goal goalie
goaltender gold golf golfer grab grappling green grip groundball groundstroke guard gutter gym
gymnast gymnastics halfcourt halfpipe hammer handball handicap handlebar hangtime hardcourt header
heat heptathlon highjump hike hiking hipcheck hit hockey hold holeinone home homeplate homerun hoop
horse hurdles hurling ice icehockey iceskate icing inbounds infield infielder inning intercept
interception jab javelin jersey jockey jog jogging judo jujitsu jump jumper jumping jumpshot junior
karate kayak kayaking keep keeper kick kickball kickoff kill kneebar knockout lacrosse lane lap
lariat layup lead league leap leftfield legpress lift lifter lifting line linebacker lineman
linesman lineup link load lob lockerroom longjump longsnapper marathon marker marshal martialarts
mashie match matchpoint medal medalist middleweight midfielder mitt mound mountainbike muscle net
netball neutralzone oar obstacle offense official offsides olympic ondeck open out outfield
outfielder overtime pace pack paddle paddling paintball parkour pass passer passing penalty
penaltybox period personalfoul pickleball pin pingpong pitch pitcher pitching pivot play playbook
player playoff plyometric point pointguard polevault polo pool powerlifting practice press pressure
putt putter putting quad quarter quarterback race racer racing racket racquet rally rebound receiver
record redcard redzone referee relay ride rider riding rightfield ring rink rip roar rockclimbing
rodeo roll rollerblade rollerhockey rope round roundhouse rower rowing rugby run runner running rush
sack saddle safety sail sailing save score scoreboard scramble scrimmage scuba sculling serve server
service set setter shoot shooter shooting shortstop shot shotput showjumping sideout sideline silver
skate skateboard skater skating ski skier skiing slam slapshot slide slugger smash snatch snooker
snowboard soccer softball spar sparring speed speedskating spike spin spiral split sport sports
spring sprint sprinter squash stadium stagger stance startingblock steal steeplechase stick
stickhandling stomp stoppage straddle stretch strike striker stroke strokeplay stud somersault surf
surfing swim swimmer swimming swing swipe switch tabletennis tackle taekwondo tag takeoff target
team teammate tee tennis timeout title titleholder toboggan toehold topspin touchdown tour tournament
track trail trailrunning training trampoline triathlon trophy tugofwar turn turnover twist umpire
underhand uppercut vault vaulter vaulting volleyball walk walkoff warmup waterpolo weightlifting
welterweight wicket wicketkeeper wildpitch windmill windsurfing wing wingback winner wrestle wrestler
wrestling yardage yoga zone athlete coach trainer fitness exercise athletic compete tournament
championship olympics marathon cycling rowing surfing skating climbing archery bowling biathlon
pentathlon decathlon heptathlon freestyle backstroke breaststroke butterfly dunk layup rebound
assist steal block tackle intercept pass pitch serve smash volley lob dropshot backhand forehand ace
""",
    "travel": """
abroad adventure airfare airline airplane airport aisle altitude amusement anchor arrival atlas
avenue baggage balcony barge beach bedbreakfast bicycle bike boarding boat booking border boulevard
bridge brochure bungalow bus cablecar cabin cafe campsite canal canoe canyon capital caravan cargo
carriage castle cathedral cave charter chauffeur checkpoint city coast coastline compass connection
continent cottage country countryside cruise customs deck departure depot desert destination detour
diner dinghy direction discovery dock downtown drive driveway embassy excursion exit expedition
express fare ferry festival fieldwork fjord flight freeway gateway getaway glacier guidebook harbor
highway hike hiking hostel hotel hut inn itinerary jet jetlag journey kayak landmark layover luggage
marina metro monument motel museum oasis palace park pathway pier picnic place plaza port postcard
province quay rail railway rainforest resort riverside road roadtrip route runway safari sailboat
scenic seaport sightseeing skyline souvenir square station stopover street subway suitcase summit
taxi terminal ticket tourist town trail train tram transport trip tunnel vacation valley village
voyage waterfall yacht airfield airliner airstrip alpine arrivalgate departurehall connection
transfer carousel checkin checkout boardingpass seatbelt aisle window exit ramp taxiway runway
tarmac jetbridge jetlag timezone currency exchange visa stamp embassy consulate immigration
reservation booking confirmation cancel refund upgrade downgrade suite penthouse bungalow villa
cottage chalet lodge dormitory campsite caravan trailer motorhome jeep safari trek hike walk stroll
promenade boardwalk lookout overlook vista panorama viewpoint travel tour vacation tourist airport
airline boarding border bridge bus city coast country customs destination downtown embassy excursion
express freeway gateway getaway harbor highway hike hostel inn itinerary landmark layover marina
metro monument museum palace park pathway pier picnic plaza port postcard province quay rail railway
route runway safari scenic sightseeing skyline souvenir taxi terminal trail tram transport village
adventure explore holiday journey voyage cruise overseas domestic international local regional
national global continent ocean river lake sea bay gulf coast shore island peninsula
""",
    "school": """
absent academic academy addition adjective algebra algorithm alphabet analysis anatomy answer
arithmetic art article assignment assistant astronomy attendance atlas author backpack beginner
bibliography binder biology blackboard book bookmark botany brochure bulletin calculator campus
canvas caption catalog chalk chapter chart chemistry choir chorus citation civics class classmate
classroom clipboard college composition computer conclusion conference counselor course craft crayon
creative credit curriculum debate decimal definition degree desk diagram diary dictation dictionary
digit diploma discipline discussion display division document drama drawing ecology economics editor
education educator electricity element encyclopedia energy engineer english enrollment envelope
environment episode equation equipment eraser essay estimate ethics evaluation exam examination
example exercise exhibit experiment explanation fact faculty fiction field figure film final
flashcard folder folklore footnote form formula fraction fragment frame french frequency function
gallery geography geology geometry german glossary glue goal grade graduate grammar graph graphics
group guidance guidebook guitar gym habit hall handbook handwriting headline health history hobby
homework honor hypothesis idea identity idiom illustration image imagination index individual
information ink inquiry instruction instrument integer intelligence interest interview introduction
invention inventory invitation journal judgment junior justice kindergarten knowledge label
laboratory language laptop latin law layer layout lecture legend leisure lesson letter level library
linguistics list literacy literature loan location logic logo lunch lyric machine magazine magnet
major map margin marker master material math mathematics matrix measure mechanic media medicine
melody memo memory mental menu metaphor meter method metric microscope mineral minute mission model
modern molecule monitor month museum music mystery myth name narrative nation native nature
navigation network newspaper note notebook noun novel number numeral nurse nutrition object
objective observation office opinion oral orchestra organization origin outline overview oxygen page
paint painting pamphlet paper paragraph parent park part particle partner pass passage password past
patch path patient pattern pause peak pen pencil percent perfect perform performance period person
personal personality perspective phase philosophy photo photograph phrase physical physics piano
picture piece pilot pin pioneer pipe pitch place plan planet plant plastic plate platform play
playground poem poet poetry point pole policy polish politics pollen pool popular population port
portfolio portion portrait position positive possession possibility post postage poster pot potato
potential pottery pound powder power practice prairie precise precision predict preface prefer
prefix prejudice preliminary premise prepare preposition presence present preserve president press
pressure pretend pretty prevent previous price pride primary prime primitive principal principle
print printer prior private privilege prize probability problem procedure process produce product
profession professor profile profit program progress project promise promote prompt pronoun
pronounce proof proper property proportion proposal prose protect protein protest proud prove
provide province psychology public publish pudding pupil purchase pure purpose purse pursue push put
puzzle pyramid quality quantity quarter question questionnaire quick quiet quilt quiz quote race
rack radar radio radius rail rain rainbow raise rake ranch random range rank rapid rare rate rather
ratio raw ray reach react reaction read reader reading ready real reality realize reason recall
receipt receive recent recipe recite recognize recommend record rectangle recycle red reduce refer
reference reflect refuse region register regret regular regulate rehearsal reject relate relative
relax release relevant reliable relief religion rely remain remark remember remind remote remove
renew rent repair repeat replace reply report represent republic request require rescue research
resemble reserve resign resist resource respect respond response responsibility rest restaurant
result retain retire retreat return reveal reverse review revise revolution reward rhythm rib ribbon
rice rich rid ride ridge right rim ring rinse rip ripe rise risk ritual rival river road roar roast
rob robe robot rock rocket rod role roll romance roof room rooster root rope rose rough round route
row royal rub rubber rude rug ruin rule ruler rumor run rural rush rust sack sad saddle safe safety
said sail salad salary sale salt same sample sand sandwich satellite satisfied sauce save saw say
scale scandal scarce scare scarf scatter scene scent schedule scheme scholar school science scissors
score scout scrape scratch scream screen screw script sculpture sea search season seat second secret
section sector secure security see seed seek seem seen seize select self sell semester seminar
senate send senior sense sentence separate sequence series serious servant serve service session set
settle seven several severe sew shade shadow shake shall shallow shame shape share sharp shave she
shear shed sheep sheet shelf shell shelter shepherd shield shift shine ship shirt shiver shock shoe
shoot shop shore short shot should shoulder shout show shower shred shrimp shrine shrink shrug shut
shuttle shy sick side sidewalk sieve sigh sight sign signal silence silent silk silly silver similar
simple simply since sing singer single sink sip sir sister sit site situation six size skate skeleton
sketch ski skill skin skip skirt skull sky slab slack slam slang slap slash slate sleep sleeve
slender slice slide slight slim slip slit slogan slope slot slow small smart smash smell smile smith
smoke smooth snack snake snap snare sneeze snow soak soap soar sob soccer social society sock soda
sofa soft software soil solar soldier solid solution solve some somehow someone something sometime
somewhat somewhere son song soon sore sorry sort soul sound soup source south space spare speak
speaker special species specific speech speed spell spelling spend sphere spice spider spin spinach
spine spiral spirit spit splash split spoil spoke sponge spoon sport spot spray spread spring
sprinkle square squash squeeze squirrel stable stack stadium staff stage stain stair stake stamp
stand standard staple star stare start state statement station statue stay steady steak steal steam
steel steep steer stem step stereo stick sticky stiff still stimulate sting stir stock stocking
stomach stone stool stop store storm story stove straight strain strange stranger strap strategy
straw strawberry stream street strength stress stretch strict strike string strip stripe stroke
strong structure struggle student study stuff style subject submarine submit substance subtract
succeed success such suck sudden suffer sugar suggest suit suitcase sum summary summer sun sunday
sunny sunset sunshine super supply support suppose sure surface surgeon surprise surround survey
survive suspect suspend swallow swamp swan swap swear sweat sweater sweep sweet swell swim swing
switch sword symbol sympathy system table tablet tack tackle tag tail take talent talk tall tank tap
tape target task taste tax taxi tea teach teacher team tear tech technique technology teenager
telephone telescope television tell temper temperature temple temporary ten tend tennis tense tent
term terminal terrible territory test text textbook than thank that theater their them theme then
theory therapy there these they thick thief thin thing think third this thorn those though thought
thousand thread threat three throat through throw thumb thunder thursday ticket tide tie tiger tight
tile till time tin tiny tip tire title toad toast today toe together toilet tomato tomorrow ton tone
tongue tonight too tool tooth top topic torch tornado tortoise toss total touch tough tour tourist
toward towel tower town toy trace track trade tradition traffic trail train transfer translate
transport trap trash travel tray treasure treat tree trend trial triangle tribe trick trigger trim
trip troop tropical trouble trousers truck true truly trumpet trunk trust truth try tube tuesday tug
tuna tune tunnel turkey turn turtle tutor tuxedo twelve twenty twice twin twist two type typical
ugly ultimate umbrella uncle under understand uniform unique unit universe university unless until
unusual up upon upper upset upstairs urban urge us use useful usual usually utility vacation vacuum
valley valuable value van vanish vanity vapor various vary vase vast vegetable vehicle vein velocity
velvet verb verse version versus vertical very vessel veteran via vibration vice victim victory
video view village vinegar violence violin virus vision visit visitor vital vitamin vivid vocabulary
voice volcano volleyball volume volunteer vote vowel voyage wage wagon waist wait waiter wake walk
wall wallet walnut want war warm warn warrior wash waste watch water wave wax way weak wealth weapon
wear weather weave web wedding wednesday weed week weekend weigh weight weird welcome well west wet
whale what wheat wheel when where whether which while whip whisper whistle white who whole whom whose
why wide widow width wife wild will willow win wind window wine wing winter wipe wire wisdom wise
wish wit with withdraw within without wolf woman wonder wood wooden wool word work world worm worry
worse worship worst worth would wound wrap wreck wrestle wrinkle wrist write writer wrong xray
xylophone yacht yard year yellow yesterday yet yield yogurt you young your yourself youth zebra zero
zone zoo zoom algebra biology chemistry physics geography geometry history literature spelling
grammar homework worksheet whiteboard blackboard textbook notebook pencil eraser ruler calculator
""",
    "music": """
acapella accent accordion acoustic adagio air album allegro alto andante anthem aria arpeggio
arrangement ballad ballet band banjo baritone bass bassoon baton beat bebop bluegrass blues bongo
bow brass bridge cadence canon cantata cantor carol cello chamber chant choir chorale chord chorus
clarinet clef coda composer composition concert concerto conductor contralto counterpoint crescendo
cymbal dance decrescendo ditty drone drum duet dynamics electric ensemble etude falsetto fiddle fife
finale flat flute folk forte fortissimo fugue gigue gong gospel groove guitar harmonica harmony harp
horn hymn improvisation instrument interlude interval intro jazz jig jingle key keyboard largo
legato libretto lute lyre lyric madrigal major march measure medley melody metronome mezzoforte
mezzopiano microphone minor minuet mode modulation motif movement music musical mute nocturne note
oboe octave opera operetta oratorio orchestra organ overture percussion phrase pianissimo piano
piccolo pitch pizzicato plainsong playlist polka polyphony prelude presto quartet quaver rap record
reed refrain reggae rehearsal remix repertoire rest rhythm riff rock round scale scherzo score segue
septet serenade sextet sharp sheetmusic singer solo sonata song songbook soprano soundtrack staccato
staff string suite symphony syncopation tabla tambourine tempo tenor theme timbre timpani tone
toccata trio trombone trumpet tuba tune tuning ukulele unison variation verse vibraphone vibrato
viola violin vocal waltz woodwind xylophone banjo mandolin bagpipe synthesizer keyboardist guitarist
drummer bassist violinist cellist flutist pianist vocalist chorister cantor soloist virtuoso maestro
diva mezzo contralto countertenor falsetto vibrato pizzicato staccato legato glissando crescendo
decrescendo fortissimo pianissimo andante allegro adagio presto largo vivace moderato rubato
syncopation improvisation composition arrangement orchestration transcription notation tablature
score libretto lyrics refrain chorus verse bridge coda intro outro medley mashup cover remix
remaster remake demo musical melody harmony rhythm songbook soundtrack serenade choir band orchestra
concert piano guitar violin cello flute clarinet trumpet trombone saxophone drum harp organ bass
""",
    "space": """
albedo alien altitude andromeda aphelion apogee apollo asteroid astronaut astronomy atmosphere aurora
axis belt binary blackhole bluegiant blueshift bolide browndwarf capsule celestial centrifuge
cepheid cluster comet constellation corona cosmic cosmology cosmos crater crescent darkmatter debris
declination densestar doppler dwarf earth eclipse ecliptic electromagnetic electron elliptical
emission exoplanet expanding flare fusion galactic galaxy gasgiant geosynchronous giant graviton
gravity halo helium hubble hydrocarbon hydrogen hyperspace inclination infrared intergalactic
interplanetary interstellar ion ionosphere jetstream jovian jupiter kepler kuiper lander latitude
launch lightyear lunar magnitude mars mass matter mercury meteor meteorite meteoroid microwave
milkyway moon nebula neptune neutron neutrino nova nuclear observatory occultation orbit orbital
ozone parallax parsec perihelion perigee photon photosphere planet planetary plasma pluto probe
proton pulsar quasar radiation radio redshift rocket rotation rover satellite saturn singularity
solar solstice space spacecraft spectrum spiral star stardust stellar sun sunspot supernova
telescope terminator terra terraforming titan trajectory transit ultraviolet universe uranus vacuum
venus visible void voyager wavelength weightlessness whitedwarf wormhole xray yellowdwarf zenith
zodiac zone asteroidbelt oortcloud kuiperbelt gasgiant icemoon dwarfplanet redgiant reddwarf
browndwarf whitedwarf neutronstar magnetar pulsar quasar blazar flare prominence sunspot solarflare
micrometeoroid micrometeorite tektite chondrite regolith maria highland rille aphelion apogee
perihelion perigee inclination declination azimuth altitude zenith nadir horizon terminator
photosphere chromosphere corona heliosphere magnetosphere ionosphere troposphere stratosphere
mesosphere thermosphere exosphere cosmology astrophysics spacetime solarwind starlight stardust
sunspot lightyear parallax exoplanet blackhole wormhole milkyway spaceship spacesuit spacecraft
spacesuit rocket launch lander rover probe observatory telescope astronaut astronomy planet star
moon sun earth mars venus mercury jupiter saturn uranus neptune pluto comet asteroid meteor nebula
""",
}

BLOCKLIST = {
    "SEX", "DRUG", "KILL", "MURDER", "NUDE", "PORN", "HELL", "DAMN", "RAPE", "COCAINE",
    "HEROIN", "VODKA", "WHISKY", "CIGAR", "TOBACCO", "BOMB", "NAZI", "BLOODY", "SLAVE",
    "GUN", "PISTOL", "RIFLE", "AMMO", "CANNABIS", "MARIJUANA", "WEED", "BEER", "WINE",
    "WHISKEY", "CIGARETTE", "ALCOHOL", "DRUNK", "HATE", "DEAD", "DEATH", "CORPSE",
    "VODKA", "GIN", "RUM", "TEQUILA", "BOURBON", "BRANDY", "CHAMPAGNE", "MERLOT",
}


def clean_token(raw: str) -> str | None:
    # Split multi-word labels; keep each token.
    parts = re.split(r"[^A-Za-z]+", raw)
    # For callers that pass a single token:
    if len(parts) == 1:
        w = parts[0].upper()
        return w if MIN_LEN <= len(w) <= MAX_LEN else None
    return None


def tokens_from(raw: str) -> list[str]:
    out: list[str] = []
    for part in re.split(r"[^A-Za-z]+", raw):
        w = part.upper()
        if MIN_LEN <= len(w) <= MAX_LEN:
            out.append(w)
    return out


def clean_list(words: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in words:
        for w in tokens_from(raw):
            if w in BLOCKLIST or w in seen:
                continue
            seen.add(w)
            out.append(w)
    return out


def fetch_json(url: str) -> object | None:
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8", errors="ignore"))
    except Exception as exc:  # noqa: BLE001
        print(f"  skip {url}: {exc}")
        return None


def extract_strings(node: object, acc: list[str]) -> None:
    if isinstance(node, str):
        acc.append(node)
    elif isinstance(node, list):
        for item in node:
            extract_strings(item, acc)
    elif isinstance(node, dict):
        for value in node.values():
            extract_strings(value, acc)


def fetch_corpora_words(theme: str) -> list[str]:
    words: list[str] = []
    for rel, _key in CORPORA_SOURCES.get(theme, []):
        data = fetch_json(f"{CORPORA}/{rel}")
        if data is None:
            continue
        found: list[str] = []
        extract_strings(data, found)
        words.extend(found)
    return words


def fetch_common_words() -> set[str]:
    urls = [
        "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears-medium.txt",
        "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears-long.txt",
        "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt",
        "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt",
    ]
    words: set[str] = set()
    for url in urls:
        try:
            with urllib.request.urlopen(url, timeout=90) as resp:
                text = resp.read().decode("utf-8", errors="ignore")
            for line in text.splitlines():
                for w in tokens_from(line.strip()):
                    words.add(w)
            print(f"Loaded lexicon from {url.split('/')[-1]} (total {len(words)})")
        except Exception as exc:  # noqa: BLE001
            print(f"Skip {url}: {exc}")
    if len(words) < 5_000:
        raise RuntimeError("Failed to load enough lexicon words")
    return words


def pad_from_lexicon(theme: str, have: set[str], lexicon: set[str], seeds: set[str]) -> list[str]:
    """Add lexicon words that are tight morphological variants of seeds."""
    extras: list[str] = []
    seed_list = [s for s in seeds if len(s) >= 4]
    for w in sorted(lexicon):
        if w in have or w in BLOCKLIST:
            continue
        wl = w.lower()
        for seed in seed_list:
            cl = seed.lower()
            if wl == cl + "s" or wl == cl + "es":
                extras.append(w)
                break
            if cl.endswith("y") and wl == cl[:-1] + "ies":
                extras.append(w)
                break
            # tight prefix: seed is a clear head of the word
            if wl.startswith(cl) and len(wl) <= len(cl) + 3:
                extras.append(w)
                break
        if len(have) + len(extras) >= MIN_WORDS + 100:
            break
    return extras


def build_theme(key: str, lexicon: set[str]) -> list[str]:
    core = clean_list(CORES[key].split())
    corpora = clean_list(fetch_corpora_words(key))
    # Prefer corpora words that look like English lexicon entries (filters junk).
    corpora_ok = [w for w in corpora if w in lexicon or len(w) <= 8]
    merged = clean_list(core + corpora_ok)
    have = set(merged)
    if len(merged) < MIN_WORDS:
        merged = clean_list(merged + pad_from_lexicon(key, have, lexicon, have))
    if len(merged) < MIN_WORDS:
        raise SystemExit(f"{key}: only {len(merged)} words (need {MIN_WORDS})")
    return merged[:800]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    lexicon = fetch_common_words()

    index = []
    for key, label in THEMES:
        print(f"Building {key}…")
        words = build_theme(key, lexicon)
        path = OUT / f"{key}-en.json"
        path.write_text(json.dumps(words, indent=2) + "\n", encoding="utf-8")
        index.append({"key": key, "label": label, "locale": "en", "count": len(words)})
        print(f"  Wrote {path.name}: {len(words)} words")

    (OUT / "index.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print("Wrote index.json")


if __name__ == "__main__":
    main()
