"""Generate supplemental pads so each theme reaches 500+ words."""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent / "wordlist-pads.json"


def clean(raw: str) -> str | None:
    w = re.sub(r"[^A-Za-z]", "", raw).upper()
    return w if 3 <= len(w) <= 12 else None


STEMS: dict[str, str] = {
    "nature": """
tree river lake ocean sea mountain forest wood meadow grass flower plant leaf root seed storm rain
snow wind cloud sun moon star rock stone sand beach shore cliff cave valley canyon desert jungle
swamp marsh pond creek brook stream spring autumn winter summer field hill peak summit ridge trail
path grove pine oak maple birch willow moss fern coral reef tide wave fog mist dew frost ice glacier
volcano lava earth soil dirt mud clay chalk coast island peninsula bay gulf harbor cape dune prairie
tundra rainforest wetland woodland habitat wildlife ecology climate weather season landscape
wilderness outdoor nature bloom blossom petal pollen branch bark trunk orchard vineyard garden park
pasture farmland hillside riverbank waterfall geyser lakebed seabed seashell seaweed shoreline
coastline grassland forestland blizzard cyclone hurricane tornado thunder lightning rainbow aurora
comet eclipse solstice equinox horizon sunrise sunset daylight moonlight starlight sunlight afterglow
avalanche badland basalt bedrock berm biome bog boreal boulder breeze butte cactus caldera canopy
cascade cavern chaparral clearing coldsnap conifer cove crater crest crevasse crystal current delta
drought dustdevil earthquake embankment estuary evergreen foothill fossil freshwater gale geothermal
greenbelt hail headland heath highland hollow inlet karst kelp knoll lagoon ledge loam lowland
mangrove marine mesa monsoon moraine mudflat oasis outcrop overlook ozone peat plateau precipice
quarry ravine sandstone savanna seabed sediment sierra snowfall steppe swamp talus terrace thorn
tidal timber tributary tropical undergrowth upland vortex watershed zephyr alpine arctic coastal
temperate tropical deciduous evergreen coniferous floral fauna flora terrain topography biosphere
ecosystem environment conservation preserve sanctuary reserve parkland greenspace countryside
""",
    "household": """
house home room kitchen bathroom bedroom hallway garage attic basement closet cupboard drawer shelf
table chair sofa couch bed desk lamp clock mirror pillow blanket curtain carpet rug sink faucet
stove oven fridge freezer washer dryer broom mop sponge towel soap dish cup plate bowl fork knife
spoon pan pot kettle toaster blender mixer vacuum iron phone radio remote tool hammer ladder paint
brush bucket basket bag box door floor wall window roof stair laundry detergent cleaner appliance
furniture utensil gadget household pantry wardrobe dresser mattress quilt sheet napkin tissue toilet
shower bathtub doorknob hinge lock key switch outlet plug wire cable battery charger printer
computer tablet laptop keyboard mouse headphones speaker alarm calendar candle frame vase hanger
hook rack stand tray mat pad cover lid jar bottle can tin foil wrap tape glue scissors stapler
paper pencil pen notebook binder folder book magazine newspaper mail package suitcase backpack
wallet purse umbrella coat jacket hat glove scarf boot shoe sock shirt pants dress skirt sweater
jeans apron colander grater peeler whisk spatula ladle tongs rollingpin cuttingboard choppingboard
dishrack dishtowel potholder ovenmitt placemat coaster tablecloth bedspread duvet comforter
nightstand bookshelf bookcase ottoman armchair recliner loveseat sectional coffee table endtable
sidetable diningtable deskchair stool bench cabinet sideboard hutch china closet wardrobe dresser
""",
    "body": """
body head face eye ear nose mouth lip tooth tongue chin cheek brow forehead scalp hair neck throat
shoulder arm elbow wrist hand finger thumb palm nail chest back spine rib waist hip leg knee ankle
foot toe heel bone muscle blood heart lung liver kidney stomach brain nerve skin vein artery joint
organ cell tissue skull marrow ligament tendon cartilage gland pulse pupil iris cornea retina
eardrum larynx trachea esophagus intestine bladder spleen pancreas thyroid appendix abdomen torso
limb flesh anatomy health medical physiology skeleton muscle organ bone blood skin nerve joint
artery vein cell tissue organ heart lung liver kidney brain stomach intestine muscle tendon
ligament cartilage marrow femur tibia fibula humerus radius ulna clavicle scapula sternum pelvis
patella vertebra coccyx sacrum mandible maxilla zygoma sinus tonsil adenoid alveolus capillary
synapse neuron cortex cerebellum cerebrum brainstem diaphragm deltoid bicep tricep quadriceps
hamstring glute calf shin instep arch navel groin temple crown lash eyelid nostril gum molar
canine bicuspid wisdom fang tusk whisker freckle wrinkle pore follicle sweat saliva tears lymph
plasma serum hormone enzyme vitamin protein calcium collagen keratin melanin hemoglobin oxygen
""",
    "sports": """
sport game team ball court field track pool gym coach athlete player race run jump throw kick swim
dive skate ski surf climb bike boat sail row wrestle box fence golf tennis soccer baseball
basketball volleyball hockey football rugby cricket lacrosse badminton archery bowling cycling
running sprint marathon triathlon olympic medal score goal win lose match league tournament
championship referee umpire stadium arena jersey bat racket club stick net hoop paddle canoe kayak
snowboard skateboard rollerblade cheer fitness exercise training workout practice drill stretch
warmup cooldown strength speed agility endurance balance flexibility yoga pilates weightlifting
powerlifting crossfit judo karate taekwondo wrestling boxing fencing gymnastics cheerleading
horseback polo squash racquetball handball waterpolo diving surfing sailing rowing canoeing
kayaking climbing hiking camping fishing hunting bobsled curling biathlon pentathlon decathlon
heptathlon steeplechase hurdles relay freestyle backstroke breaststroke butterfly butterfly
sidestroke dogpaddle backflip cartwheel handstand headstand somersault vault bars beam rings
pommel parallel uneven trampoline dunk layup rebound assist steal block tackle intercept pass pitch
serve smash volley lob dropshot backhand forehand ace fault deuce advantage set matchpoint
tiebreak overtime shootout penalty corner throwin kickoff faceoff tipoff tipoff tipoff tipoff
""",
    "travel": """
travel trip tour vacation holiday journey voyage flight airline airplane airport hotel motel hostel
inn resort cabin camp cruise ship boat ferry train subway metro bus taxi cab passport ticket
luggage baggage suitcase backpack map guide tourist visitor customs border bridge tunnel road
highway freeway street avenue boulevard downtown city town village country island beach mountain
desert forest park museum palace castle cathedral monument landmark harbor port marina pier dock
station terminal gate boarding layover itinerary adventure explore sightseeing souvenir postcard
plaza square trail path route scenic getaway escape weekend abroad overseas domestic international
local regional national global continent ocean river lake sea bay gulf coast shore peninsula
airfield airliner airstrip alpine arrival departure connection transfer carousel checkin checkout
boardingpass seatbelt aisle window exit ramp taxiway runway tarmac jetbridge jetlag timezone
currency exchange visa stamp embassy consulate immigration quarantine quarantine quarantine
reservation booking confirmation cancel refund upgrade downgrade suite penthouse bungalow villa
cottage chalet lodge hostel dormitory campsite caravan trailer motorhome rv jeep safari trek hike
walk stroll promenade esplanade boardwalk pier promenade lookout overlook vista panorama viewpoint
""",
    "music": """
music song melody harmony rhythm beat tempo pitch note scale chord tone tune lyric singer band
choir orchestra concert piano guitar violin cello flute clarinet trumpet trombone saxophone drum
harp organ bass alto tenor soprano baritone opera jazz blues rock folk country classical reggae
gospel hymn anthem ballad waltz march sonata symphony concerto prelude fugue aria duet trio
quartet solo ensemble composer conductor musician instrumental vocal acoustic electric remix
rehearsal playlist soundtrack album record microphone metronome sheetmusic staff clef sharp flat
major minor octave interval progression percussion woodwind brass string keyboard banjo ukulele
mandolin bagpipe accordion harmonica xylophone vibraphone timpani cymbal tambourine triangle
maracas castanet bongo conga tabla sitar oud lute lyre zither dulcimer harpsichord clavichord
synthesizer keyboardist guitarist drummer bassist violinist cellist flutist pianist vocalist
chorister cantor soloist virtuoso maestro diva tenor baritone mezzo contralto countertenor
falsetto vibrato pizzicato staccato legato glissando crescendo decrescendo fortissimo pianissimo
andante allegro adagio presto largo vivace moderato rubato syncopation improvisation composition
arrangement orchestration transcription notation tablature score partiture libretto lyrics refrain
chorus verse bridge coda intro outro medley mashup cover remix remaster remake demo bootleg
""",
    "space": """
space cosmos universe galaxy star planet moon sun earth mars venus mercury jupiter saturn uranus
neptune pluto asteroid comet meteor meteorite nebula quasar pulsar nova supernova orbit orbital
rocket satellite astronaut astronomy telescope observatory launch lander rover probe spacecraft
spaceship spacesuit solar stellar lunar gravity atmosphere ozone aurora eclipse solstice equinox
constellation zodiac celestial cosmic interstellar galactic planetary kuiper hubble apollo voyager
titan crater continuum spectrum radiation vacuum redshift blueshift lightyear parallax exoplanet
blackhole wormhole milkyway stardust starlight sunspot solarwind spacetime cosmology astrophysics
aphelion apogee perihelion perigee inclination declination rightascension azimuth altitude zenith
nadir horizon terminator photosphere chromosphere corona heliosphere magnetosphere ionosphere
troposphere stratosphere mesosphere thermosphere exosphere asteroidbelt oortcloud kuiperbelt
gasgiant icemoon dwarfplanet redgiant reddwarf browndwarf whitedwarf neutronstar magnetar pulsar
quasar blazar pulsar nova flare prominence sunspot solarflare coronalmass ejection micrometeoroid
micrometeorite tektite chondrite achondrite ironstone stonyiron regolith maria highland rille
""",
}


def fetch_common() -> set[str]:
    urls = [
        "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears-medium.txt",
        "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears-long.txt",
        "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt",
    ]
    common: set[str] = set()
    for url in urls:
        text = urllib.request.urlopen(url, timeout=60).read().decode("utf-8", errors="ignore")
        for line in text.splitlines():
            w = clean(line.strip())
            if w:
                common.add(w)
    return common


def expand(theme: str, common: set[str]) -> list[str]:
    seed: set[str] = set()
    for raw in STEMS[theme].split():
        w = clean(raw)
        if w:
            seed.add(w)
    out: list[str] = []
    seen: set[str] = set()
    for w in sorted(seed):
        if w not in seen:
            seen.add(w)
            out.append(w)
    for w in sorted(common):
        if w in seen:
            continue
        wl = w.lower()
        for c in seed:
            cl = c.lower()
            if len(cl) < 4:
                continue
            if wl == cl or wl == cl + "s" or wl == cl + "es":
                seen.add(w)
                out.append(w)
                break
            if cl.endswith("y") and wl == cl[:-1] + "ies":
                seen.add(w)
                out.append(w)
                break
            if wl.startswith(cl) and len(cl) >= 5 and len(wl) <= len(cl) + 3:
                seen.add(w)
                out.append(w)
                break
    return out


def main() -> None:
    common = fetch_common()
    pads = {theme: expand(theme, common) for theme in STEMS}
    for theme, words in pads.items():
        print(f"{theme}: {len(words)}")
    OUT.write_text(json.dumps(pads, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
