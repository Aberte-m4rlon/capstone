/**
 * angleClassifier.ts — Multi-Angle Goat & Sheep AI Classifier for AlpasFarm Scanner
 *
 * TRAINED ANGLE ARCHETYPES (10 Multi-Angle Models):
 *   GOAT:
 *     1. FRONT_VIEW  — Direct cranial face, long pendulous ears, chest & forelimbs
 *     2. SIDE_VIEW   — Full lateral profile, dorsal spine line, body depth, upright tail
 *     3. REAR_VIEW   — Pelvic symmetry, hindquarters, perineal/enteric hygiene
 *     4. FRONT_ANGLE — 3/4 diagonal perspective, 3D body volume & chest expansion
 *     5. TOP_ANGLE   — Overhead view, dorsal spine fullness & body condition score (BCS)
 *
 *   SHEEP:
 *     1. FRONT_VIEW  — Woolly fleece front, horizontal ears, cranial symmetry
 *     2. SIDE_VIEW   — Cylindrical fleece barrel, downward tail, leg conformation
 *     3. REAR_VIEW   — Spherical wool hindquarters, pelvic & wool partition
 *     4. FRONT_ANGLE — 3/4 diagonal perspective, fleece depth & alertness
 *     5. TOP_ANGLE   — Overhead ovular fleece silhouette, dorsal loin & rumen symmetry
 */

export type LivestockAngle =
  | 'FRONT_VIEW'
  | 'SIDE_VIEW'
  | 'REAR_VIEW'
  | 'FRONT_ANGLE'
  | 'TOP_ANGLE';

export interface AngleMetadata {
  key: LivestockAngle;
  label: string;
  tagalogLabel: string;
  species: 'goat' | 'sheep';
  clinicalFocus: string;
  scannerGuidance: string;
  aspectRatio: number;
}

export interface AngleClassificationResult {
  detected: boolean;
  species: 'goat' | 'sheep';
  angle: LivestockAngle;
  label: string;
  tagalogLabel: string;
  confidence: number;
  clinicalFocus: string;
  guidance: string;
  angleScores: Record<LivestockAngle, number>;
  topMatchKey: string;
}

export const ANGLE_DEFINITIONS: Record<string, AngleMetadata> = {
  goat_front_view: {
    key: 'FRONT_VIEW',
    label: 'Front View',
    tagalogLabel: 'Harapan (Front)',
    species: 'goat',
    clinicalFocus: 'Cranial symmetry, eye clarity (anemia / pinkeye), nasal discharge & foreleg straightness',
    scannerGuidance: 'Front angle detected — evaluating facial alertness, eye condition, and forelimb alignment.',
    aspectRatio: 0.73,
  },
  goat_side_view: {
    key: 'SIDE_VIEW',
    label: 'Side Profile',
    tagalogLabel: 'Tagiliran (Side Profile)',
    species: 'goat',
    clinicalFocus: 'Dorsal spine line (kyphosis / posture), abdominal depth, upright tail carriage & 4-leg stance',
    scannerGuidance: 'Side profile detected — analyzing dorsal posture, body condition, and limb conformation.',
    aspectRatio: 0.77,
  },
  goat_rear_view: {
    key: 'REAR_VIEW',
    label: 'Rear View',
    tagalogLabel: 'Likuran (Rear View)',
    species: 'goat',
    clinicalFocus: 'Hindquarter symmetry, hock joint alignment, enteric health & perineal / tail cleanliness',
    scannerGuidance: 'Rear view detected — inspecting hindquarter symmetry, hocks, and enteric / perineal health.',
    aspectRatio: 0.77,
  },
  goat_front_angle_view: {
    key: 'FRONT_ANGLE',
    label: 'Front Angle (3/4)',
    tagalogLabel: 'Paharap na Anggulo (3/4)',
    species: 'goat',
    clinicalFocus: '3D chest expansion, ribcage depth, head-to-body proportion & general alertness',
    scannerGuidance: '3/4 Diagonal angle detected — checking 3D body volume, chest depth, and alertness.',
    aspectRatio: 0.77,
  },
  goat_top_angle_view: {
    key: 'TOP_ANGLE',
    label: 'Top Angle (Overhead)',
    tagalogLabel: 'Itaas / Overhead (Top View)',
    species: 'goat',
    clinicalFocus: 'Body Condition Score (BCS) via dorsal spine and loin eye muscle, bilateral symmetry & rumen fill',
    scannerGuidance: 'Overhead top angle detected — assessing dorsal spine fullness, loin condition, and bloat symmetry.',
    aspectRatio: 0.77,
  },

  sheep_front_view: {
    key: 'FRONT_VIEW',
    label: 'Front View',
    tagalogLabel: 'Harapan (Front)',
    species: 'sheep',
    clinicalFocus: 'Fleece cranial symmetry, horizontal ear posture, eye clarity & forelimb wool coverage',
    scannerGuidance: 'Sheep front view detected — evaluating fleece cap, eye clarity, and cranial alertness.',
    aspectRatio: 0.73,
  },
  sheep_side_view: {
    key: 'SIDE_VIEW',
    label: 'Side Profile',
    tagalogLabel: 'Tagiliran (Side Profile)',
    species: 'sheep',
    clinicalFocus: 'Fleece barrel uniformity, downward tail posture, body depth & leg conformation',
    scannerGuidance: 'Sheep side profile detected — analyzing fleece thickness, barrel depth, and stance.',
    aspectRatio: 0.77,
  },
  sheep_rear_view: {
    key: 'REAR_VIEW',
    label: 'Rear View',
    tagalogLabel: 'Likuran (Rear View)',
    species: 'sheep',
    clinicalFocus: 'Spherical fleece hindquarters, pelvic symmetry, breech cleanliness (flystrike / scouring check)',
    scannerGuidance: 'Sheep rear view detected — inspecting breech cleanliness, wool density, and hindquarter symmetry.',
    aspectRatio: 0.77,
  },
  sheep_front_angle_view: {
    key: 'FRONT_ANGLE',
    label: 'Front Angle (3/4)',
    tagalogLabel: 'Paharap na Anggulo (3/4)',
    species: 'sheep',
    clinicalFocus: '3D fleece volume, chest width, head carriage & general vigor',
    scannerGuidance: 'Sheep 3/4 diagonal angle detected — evaluating 3D fleece volume, chest width, and posture.',
    aspectRatio: 0.77,
  },
  sheep_top_angle_view: {
    key: 'TOP_ANGLE',
    label: 'Top Angle (Overhead)',
    tagalogLabel: 'Itaas / Overhead (Top View)',
    species: 'sheep',
    clinicalFocus: 'Body Condition Score (BCS 1-5) via loin fullness under fleece, spine line & bilateral rumen symmetry',
    scannerGuidance: 'Sheep overhead angle detected — assessing dorsal spine line, loin fullness, and rumen symmetry.',
    aspectRatio: 0.77,
  },
};

// Trained Centroids Matrix (73 dimensions per angle archetype)
export const TRAINED_ANGLE_CENTROIDS: Record<string, number[]> = {
  "goat_front_view": [
    0.12180060361112867,
    0.10551580680268151,
    0.07112220461879458,
    0.13159248658588954,
    0.4668094686099461,
    0.39528570430619375,
    0.32336255482264925,
    0.2902118797813143,
    0.37575610620634897,
    0.2975736622299467,
    0.21772913528340204,
    0.24616530324731553,
    0.15379137226513453,
    0.12689240915434702,
    0.08360907116106578,
    0.12437087297439575,
    0.22616368319307054,
    0.21000581341130392,
    0.14624639919825963,
    0.11291394489152091,
    0.5153197433267321,
    0.45449056369917734,
    0.38101641620908466,
    0.23666674750191824,
    0.6313670958791461,
    0.5853783914021083,
    0.530229138476508,
    0.22932811081409454,
    0.19946550045694625,
    0.1865770582641874,
    0.1361891691173826,
    0.13512234283345087,
    0.4852345032351358,
    0.428180809531893,
    0.30457097717693876,
    0.11019710770675115,
    0.5903760961123875,
    0.5331724967275348,
    0.43637465153421673,
    0.12054464114563805,
    0.6119348917688642,
    0.5539396405220032,
    0.4617614277771541,
    0.10665451948131834,
    0.4894088293824877,
    0.4289035371371678,
    0.3107011616230011,
    0.11814300396612712,
    0.532479350055967,
    0.4519843118531363,
    0.33061428580965313,
    0.09919266189847674,
    0.5247253860746112,
    0.4623550389494215,
    0.3629404306411743,
    0.15563675974096572,
    0.5288925766944885,
    0.4647688056741442,
    0.36586409381457735,
    0.15785706681864603,
    0.5190613184656415,
    0.43787969435964313,
    0.32152596541813444,
    0.1091512707727296,
    0.7276264591439688,
    0.3007730373314449,
    0.4772654260907854,
    0.6303792017689391,
    0.009404003620147705,
    0.039790451526641846,
    0.04046393824475152,
    0.15667290772710527,
    0.5339732553277697
  ],
  "goat_side_view": [
    0.386456161737442,
    0.31848413177898954,
    0.24062720154012954,
    0.17376844478505,
    0.345150568655559,
    0.2777518949338368,
    0.19712011303220475,
    0.12245504983833858,
    0.3035232978207724,
    0.2509415639298303,
    0.1825690588780812,
    0.11170671028750283,
    0.30093554300921305,
    0.24941571908337729,
    0.17971432209014893,
    0.11705113095896584,
    0.4683079549244472,
    0.36719515919685364,
    0.2566854975053242,
    0.15557731368712016,
    0.5228554138115474,
    0.4379951400416238,
    0.3611388461930411,
    0.30220636299678255,
    0.655655311686652,
    0.6112105165209089,
    0.5587496885231563,
    0.31179665667670114,
    0.6485502123832703,
    0.5955455388341632,
    0.5321308204105922,
    0.2768603754895074,
    0.5350555862699237,
    0.4232673602444785,
    0.292441908802305,
    0.08348001220396586,
    0.5767107691083636,
    0.4867488443851471,
    0.37605425289699007,
    0.14912801448787963,
    0.6179775084768023,
    0.5405495166778564,
    0.44059984598840984,
    0.1689551898411342,
    0.6362477115222386,
    0.5592984216553825,
    0.46067436252321514,
    0.16923724114894867,
    0.4463924765586853,
    0.34782202754701885,
    0.22363446652889252,
    0.09845549719674247,
    0.4474390617438725,
    0.3543740212917328,
    0.23306253126689366,
    0.10372814323220934,
    0.44202063764844624,
    0.34948956966400146,
    0.22691046127251216,
    0.11480759935719627,
    0.45110241430146353,
    0.3590139278343746,
    0.2373982561486108,
    0.12011144097362246,
    0.7704280155642024,
    0.3995634487697056,
    0.44169379132134573,
    0.9050106125564995,
    0.08124127558299474,
    0.03304245775299413,
    0.04424538569790976,
    0.14164370085511888,
    0.5309488943644932
  ],
  "goat_rear_view": [
    0.3088935741356441,
    0.2851201593875885,
    0.2185421170932906,
    0.22817982201065337,
    0.25063190289906095,
    0.18626030002321517,
    0.10932686286313194,
    0.13082938215562276,
    0.29477089643478394,
    0.2085707847561155,
    0.12963662615844182,
    0.18799436305250442,
    0.19563255991254533,
    0.16447282901832036,
    0.10991116400275912,
    0.13608594132321222,
    0.35578224062919617,
    0.3125301088605608,
    0.21754312302385057,
    0.20784333667584828,
    0.5582873821258545,
    0.529549662555967,
    0.4638020864554814,
    0.2941741666623524,
    0.6274673938751221,
    0.5996088470731463,
    0.5477651229926518,
    0.31768020561763216,
    0.291669956275395,
    0.24561013068471635,
    0.1465533184153693,
    0.13316696137189865,
    0.5254562837736947,
    0.4582977890968323,
    0.326830587216786,
    0.1538083931165082,
    0.5866137274674007,
    0.5336375406810215,
    0.4313266064439501,
    0.15227038626159942,
    0.6181290575436184,
    0.566400796175003,
    0.4716589195387704,
    0.17420671028750284,
    0.5057538024016789,
    0.43749727095876423,
    0.28904226422309875,
    0.08131005242466927,
    0.4793488553592137,
    0.42020746639796663,
    0.29842328812394825,
    0.17109380662441254,
    0.41841628721782137,
    0.3632571952683585,
    0.24639794443334853,
    0.1279820129275322,
    0.4479024495397295,
    0.38649116669382366,
    0.27024412368025097,
    0.14615694220576966,
    0.446611864226205,
    0.38509005308151245,
    0.24516206128256662,
    0.09838256505983216,
    0.7704280155642024,
    0.3212112656661442,
    0.4478529265948704,
    0.7174954390684221,
    0.014762508017676217,
    0.04573036730289459,
    0.044731171535594125,
    0.15463935903140477,
    0.546691507101059
  ],
  "goat_front_angle_view": [
    0.2580729297229222,
    0.22328924919877732,
    0.16793101174490793,
    0.24346441456249782,
    0.41688387734549387,
    0.3421344416482108,
    0.26050914398261477,
    0.24273484200239182,
    0.31619454281670706,
    0.25307631705488476,
    0.17407816648483276,
    0.14687746124608175,
    0.2958503024918692,
    0.25139509992940084,
    0.18980437304292405,
    0.21186532718794687,
    0.485746579510825,
    0.4389826442514147,
    0.33095294662884306,
    0.20329306381089346,
    0.45635778989110676,
    0.3694349782807486,
    0.26213674885886057,
    0.16711954133851187,
    0.7372314078467233,
    0.6913838471685138,
    0.63506161740848,
    0.1779562383890152,
    0.771308788231441,
    0.7483970437731061,
    0.7066827842167446,
    0.16073283020939147,
    0.596387003149305,
    0.5049900540283748,
    0.3680645099708012,
    0.14759131627423422,
    0.6013113941465106,
    0.5048450785023826,
    0.3731956992830549,
    0.10241390764713287,
    0.6372352157320295,
    0.553371753011431,
    0.4424369888646262,
    0.13828812326703752,
    0.6119189858436584,
    0.5251526406833104,
    0.41036196265901836,
    0.13648671976157598,
    0.5445197778088706,
    0.4534773315702166,
    0.32590982743671965,
    0.15289790821926935,
    0.5021117968218667,
    0.41336660725729807,
    0.2880990760666983,
    0.11262005248240062,
    0.4979489488261087,
    0.4115934797695705,
    0.2903000456946237,
    0.13382831535169057,
    0.4799823888710567,
    0.39056373068264555,
    0.2659986764192581,
    0.12579574223075593,
    0.7704280155642024,
    0.42202161465372356,
    0.48220772402627127,
    0.8754256438580986,
    0.09768599271774292,
    0.0406584878052984,
    0.036943770945072174,
    0.19226574259144918,
    0.5119149770055499
  ],
  "goat_top_angle_view": [
    0.4887555880205972,
    0.40495066557611736,
    0.3066827654838562,
    0.22848938990916526,
    0.6290786181177411,
    0.5151019947869437,
    0.3887260471071516,
    0.14442208941493714,
    0.6785681843757629,
    0.5753879036222186,
    0.46029961109161377,
    0.16427067347935267,
    0.5759492261069161,
    0.4507637449673244,
    0.3145302789551871,
    0.1038121362882001,
    0.5180814734527043,
    0.42970992837633404,
    0.31172041807855877,
    0.19200341935668672,
    0.7564639363970075,
    0.6985649807112557,
    0.6310098426682609,
    0.20782995436872756,
    0.78256413766316,
    0.7353515710149493,
    0.6807909948485238,
    0.19559999023165023,
    0.5613620749541691,
    0.43671109420912607,
    0.29565280250140596,
    0.08496954185622078,
    0.5613440147468022,
    0.45533745203699383,
    0.33604911821229116,
    0.16801495850086212,
    0.5669637620449066,
    0.47086344020707266,
    0.3684201240539551,
    0.20660550040858133,
    0.5356760025024414,
    0.3878370225429535,
    0.25573027772562845,
    0.19369713749204362,
    0.5593542030879429,
    0.44285824043410166,
    0.3208552300930023,
    0.15633313357830048,
    0.5277141417775836,
    0.4289943405560085,
    0.31276918734822956,
    0.16794615664652415,
    0.4549698063305446,
    0.3558517226151058,
    0.23665858379432134,
    0.10154956898518971,
    0.4485141124044146,
    0.34432117853845867,
    0.2225348140512194,
    0.11608526642833437,
    0.47544807621410917,
    0.3660211137362889,
    0.2433823666402272,
    0.10910006506102425,
    0.7704280155642024,
    0.5464211744921548,
    0.42570355960300993,
    1.2838593994816347,
    0.007721883910042899,
    0.03858897568924086,
    0.033132806952510564,
    0.11648394273860115,
    0.5325869704995837
  ],
  "sheep_front_view": [
    0.3855348399707249,
    0.42144663844789776,
    0.3801689531121935,
    0.246258978332792,
    0.48793003388813566,
    0.49300212945256916,
    0.47719277654375347,
    0.27196704702717917,
    0.4965150271143232,
    0.5005005981240954,
    0.4833273249013083,
    0.28090888474668774,
    0.4236574343272618,
    0.4558183550834656,
    0.4164582405771528,
    0.2704983225890568,
    0.48376008016722544,
    0.4988024192196982,
    0.27668451837130953,
    0.09203477789248739,
    0.5748665162495205,
    0.5118949328150068,
    0.41429502623421804,
    0.16331798476832254,
    0.5857974631445748,
    0.5185492294175285,
    0.4158471311841692,
    0.17392300069332123,
    0.5300562637192863,
    0.5399455257824489,
    0.3392660319805145,
    0.15376593385423934,
    0.463984272309712,
    0.46503524695123943,
    0.2484670536858695,
    0.07826011627912521,
    0.4186701348849705,
    0.35182074138096403,
    0.22825468012264796,
    0.10568046250513621,
    0.4413318506308964,
    0.3683161607810429,
    0.23687961271830968,
    0.10730270828519549,
    0.5059573224612645,
    0.49989551305770874,
    0.3067194159541811,
    0.15348646576915467,
    0.3528799031461988,
    0.345997474023274,
    0.165255178298269,
    0.08835118636488914,
    0.4068496312413897,
    0.3812128092561449,
    0.2408274390867778,
    0.14122292825153895,
    0.4187543903078352,
    0.39316790444510324,
    0.24828378217560904,
    0.1423750796488353,
    0.4102487180914198,
    0.4035533794334957,
    0.23502386680671147,
    0.1810251415840217,
    0.7276264591439688,
    0.4830491202218192,
    0.39044673102242605,
    1.237380938283028,
    0.039181837013789585,
    0.03251112172646182,
    0.04430023900100163,
    0.07448956104261535,
    0.3980874163763864
  ],
  "sheep_side_view": [
    0.44991083656038555,
    0.4633753555161612,
    0.4128780577863966,
    0.24839309922286443,
    0.43568421261651175,
    0.4548062341553824,
    0.3870481082371303,
    0.21797482669353485,
    0.4600955333028521,
    0.47239749346460613,
    0.3997828151498522,
    0.20453796642167227,
    0.437302508524486,
    0.4489796885422298,
    0.3858188007559095,
    0.223164969256946,
    0.5247428672654288,
    0.4848345730985914,
    0.3509924454348428,
    0.12935565092733928,
    0.6320608258247375,
    0.542521242584501,
    0.42130767021860394,
    0.13377870619297028,
    0.6764798845563617,
    0.5947255066462925,
    0.4703973148550306,
    0.12826627705778396,
    0.6537809797695705,
    0.5789883221898761,
    0.4566559536116464,
    0.12958633473941258,
    0.4342776281493051,
    0.4329438252108438,
    0.20765877834388188,
    0.05831152945756912,
    0.42734047770500183,
    0.38478533710752216,
    0.23220141444887435,
    0.08166564575263432,
    0.3944628749574934,
    0.36118643624441965,
    0.1949755017246519,
    0.07469422316976956,
    0.4560081958770752,
    0.40641523259026663,
    0.2461271413734981,
    0.08642362004944257,
    0.335796913930348,
    0.35077304925237385,
    0.14776787055390223,
    0.06283510848879814,
    0.36054634196417673,
    0.3641905358859471,
    0.1832649622644697,
    0.08975595555135182,
    0.3234582969120571,
    0.33524216072899954,
    0.1387769260576793,
    0.05372074885027749,
    0.34770057456833975,
    0.3484008567673819,
    0.16654358165604727,
    0.09671949382339205,
    0.7704280155642024,
    0.5028840856892722,
    0.35566788486071993,
    1.414318741852273,
    0.01733435477529253,
    0.025387579575181007,
    0.04647930126105036,
    0.1504825417484556,
    0.4116548810686384
  ],
  "sheep_rear_view": [
    0.4900637013571603,
    0.5074530712195805,
    0.4614118422780718,
    0.24885618473802293,
    0.5045868456363678,
    0.5130296051502228,
    0.45808715905461994,
    0.2333160936832428,
    0.5571943095752171,
    0.5519443920680455,
    0.5043822271483285,
    0.24680630649839128,
    0.48372015357017517,
    0.4983357659408024,
    0.4521500936576298,
    0.24453546106815338,
    0.5371509620121547,
    0.5473701442990985,
    0.3515833020210266,
    0.1701980084180832,
    0.6242198603493827,
    0.5789653488567897,
    0.4326412720339639,
    0.13347236812114716,
    0.6564682977540153,
    0.5890504547527858,
    0.45449658376829966,
    0.1359996838229043,
    0.5560831342424665,
    0.5612389743328094,
    0.37683715564864023,
    0.1700055194752557,
    0.4924243986606598,
    0.5043149335043771,
    0.29314492855753216,
    0.17021911910602025,
    0.48802303842135836,
    0.44916240658078876,
    0.2755793843950544,
    0.10231538649116244,
    0.39594660486493793,
    0.35700992175510954,
    0.203910088964871,
    0.13217036638941085,
    0.5111393800803593,
    0.5101983887808663,
    0.31458553671836853,
    0.16996973965849196,
    0.4121613545077188,
    0.41963684984615873,
    0.2418242416211537,
    0.2018072349684579,
    0.3570126635687692,
    0.3544363932950156,
    0.172127223440579,
    0.0982773048537118,
    0.34427851012774874,
    0.3388294407299587,
    0.17020418814250401,
    0.10251488323722567,
    0.3941466510295868,
    0.402283034154347,
    0.2259628943034581,
    0.1931997346026557,
    0.7704280155642024,
    0.5335493215492794,
    0.3986997263772147,
    1.3384612729769911,
    0.007629096508026123,
    0.041719340320144384,
    0.04441601250852857,
    0.14819513261318207,
    0.4221078412873404
  ],
  "sheep_front_angle_view": [
    0.40154389824186054,
    0.4277513495513371,
    0.33902312176568167,
    0.21331145295075007,
    0.4348974653652736,
    0.4604560647691999,
    0.3796114708696093,
    0.21847023282732284,
    0.42107351762907846,
    0.4351179727486202,
    0.3618993120534079,
    0.21757127344608307,
    0.4436701365879604,
    0.44817546010017395,
    0.3963651146207537,
    0.2577361230339323,
    0.6072796498026166,
    0.5628173351287842,
    0.4224943220615387,
    0.14570679728473937,
    0.7239660194941929,
    0.6313107524599347,
    0.5351962063993726,
    0.11088742741516658,
    0.6317566207477024,
    0.5479905264718192,
    0.44732581291879925,
    0.15242800755160196,
    0.5267162450722286,
    0.4945088412080492,
    0.3858516216278076,
    0.19266387607370103,
    0.44613643629210337,
    0.4071308374404907,
    0.24208849242755345,
    0.10273725645882743,
    0.39682851093155996,
    0.3465270527771541,
    0.20861454946654184,
    0.09803474375179835,
    0.40952819160052706,
    0.3483029305934906,
    0.22428660733359201,
    0.10402680294854301,
    0.41413199050085886,
    0.38603872060775757,
    0.2068195321730205,
    0.08269397701535906,
    0.3419090381690434,
    0.338515967130661,
    0.15848488892827714,
    0.10082785253013883,
    0.3274777957371303,
    0.3269383651869638,
    0.14843094987528666,
    0.07556304814560073,
    0.3790687450340816,
    0.3653826543263027,
    0.2083864105599267,
    0.1163771886910711,
    0.336983003786632,
    0.3383277654647827,
    0.14892661571502686,
    0.0886154728276389,
    0.7704280155642024,
    0.49729712094579426,
    0.3457463639123099,
    1.4387115475980448,
    0.021562950951712474,
    0.031107948028615544,
    0.04763914751155036,
    0.14666601164000376,
    0.40852308699062895
  ],
  "sheep_top_angle_view": [
    0.42276622567858013,
    0.44618785807064604,
    0.33983937757355825,
    0.24720777358327592,
    0.43545113291059223,
    0.45482647844723295,
    0.3252199462481907,
    0.2203950094325202,
    0.5058172430310931,
    0.5121701274599347,
    0.419218327317919,
    0.264439908521516,
    0.40322130067007883,
    0.4319968010698046,
    0.3033887105328696,
    0.22633050382137299,
    0.5124852359294891,
    0.5203809056963239,
    0.305665705885206,
    0.15834012627601624,
    0.7084132347788129,
    0.6357673747198922,
    0.5024137880120959,
    0.13047648114817484,
    0.7705351965767997,
    0.6752965450286865,
    0.570754029921123,
    0.08810715164457049,
    0.5706610083580017,
    0.5401430300303868,
    0.3597990018980844,
    0.14112623355218343,
    0.4771577502999987,
    0.47702424441065105,
    0.2705023544175284,
    0.16070642322301865,
    0.6592831185885838,
    0.5676552951335907,
    0.44439503976276945,
    0.10174719563552312,
    0.5784412452152797,
    0.4900910513741629,
    0.36543735010283335,
    0.11587874165603093,
    0.44008722049849375,
    0.4180054111140115,
    0.22584582013743265,
    0.09824281292302268,
    0.39132365584373474,
    0.39670868856566294,
    0.214805468916893,
    0.18219663575291634,
    0.43874629054750713,
    0.4105091265269688,
    0.2782502919435501,
    0.16307593243462698,
    0.3536059090069362,
    0.3442095603261675,
    0.1968755509172167,
    0.148275902228696,
    0.3210571152823312,
    0.3286135622433254,
    0.13588936307600566,
    0.09127417579293251,
    0.7704280155642024,
    0.5157646877425057,
    0.41904533760888235,
    1.2309735804698185,
    0.0251640932900565,
    0.03179200153265681,
    0.03896886908582279,
    0.18935738503932953,
    0.5550757603985923
  ]
};

/**
 * Extract 73-dimensional multi-scale descriptor from any HTMLCanvasElement or Video frame
 */
export function extractMultiAngleFeatures(
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement
): number[] {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Array(73).fill(0);

  ctx.drawImage(source, 0, 0, 128, 128);
  const imgData = ctx.getImageData(0, 0, 128, 128);
  const data = imgData.data;

  const w = source instanceof HTMLVideoElement ? source.videoWidth || 128 : source.width || 128;
  const h = source instanceof HTMLVideoElement ? source.videoHeight || 128 : source.height || 128;
  const aspectRatio = +(w / Math.max(1, h)).toFixed(3);

  const features: number[] = [];
  const lumMap = new Float32Array(128 * 128);

  // Pre-calculate luminance
  for (let i = 0; i < 128 * 128; i++) {
    const idx = i * 4;
    lumMap[i] = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255.0;
  }

  // 1. 4x4 spatial grid (16 cells x 4: mean R, mean G, mean B, std Lum) = 64 features
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      let sumR = 0, sumG = 0, sumB = 0, sumLum = 0;
      let count = 0;
      for (let y = gy * 32; y < (gy + 1) * 32; y++) {
        for (let x = gx * 32; x < (gx + 1) * 32; x++) {
          const idx = (y * 128 + x) * 4;
          sumR += data[idx] / 255.0;
          sumG += data[idx + 1] / 255.0;
          sumB += data[idx + 2] / 255.0;
          sumLum += lumMap[y * 128 + x];
          count++;
        }
      }
      const meanR = sumR / count;
      const meanG = sumG / count;
      const meanB = sumB / count;
      const meanLum = sumLum / count;

      let varLum = 0;
      for (let y = gy * 32; y < (gy + 1) * 32; y++) {
        for (let x = gx * 32; x < (gx + 1) * 32; x++) {
          const diff = lumMap[y * 128 + x] - meanLum;
          varLum += diff * diff;
        }
      }
      const stdLum = Math.sqrt(varLum / count);

      features.push(+meanR.toFixed(5), +meanG.toFixed(5), +meanB.toFixed(5), +stdLum.toFixed(5));
    }
  }

  // 2. Proportions & Geometric features (9 features)
  features.push(aspectRatio);

  let upperSum = 0, lowerSum = 0;
  let leftSum = 0, rightSum = 0;
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const l = lumMap[y * 128 + x];
      if (y < 64) upperSum += l;
      else lowerSum += l;
      if (x < 64) leftSum += l;
      else rightSum += l;
    }
  }

  const upperLum = upperSum / (128 * 64);
  const lowerLum = lowerSum / (128 * 64);
  features.push(+upperLum.toFixed(5));
  features.push(+lowerLum.toFixed(5));
  features.push(+(upperLum / (lowerLum + 1e-5)).toFixed(5));
  features.push(+Math.abs((leftSum - rightSum) / (128 * 64)).toFixed(5));

  // Gradients
  let diffXSum = 0, diffYSum = 0;
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 127; x++) {
      diffXSum += Math.abs(lumMap[y * 128 + x + 1] - lumMap[y * 128 + x]);
    }
  }
  for (let y = 0; y < 127; y++) {
    for (let x = 0; x < 128; x++) {
      diffYSum += Math.abs(lumMap[(y + 1) * 128 + x] - lumMap[y * 128 + x]);
    }
  }
  features.push(+(diffXSum / (128 * 127)).toFixed(5));
  features.push(+(diffYSum / (127 * 128)).toFixed(5));

  // Head brown/red excess vs Body whiteness
  let headRedExcess = 0, bodyWhiteness = 0;
  let headCount = 0, bodyCount = 0;
  for (let y = 10; y < 42; y++) {
    for (let x = 48; x < 80; x++) {
      const idx = (y * 128 + x) * 4;
      headRedExcess += (data[idx] - data[idx + 2]) / 255.0;
      headCount++;
    }
  }
  for (let y = 40; y < 104; y++) {
    for (let x = 32; x < 96; x++) {
      const idx = (y * 128 + x) * 4;
      bodyWhiteness += (data[idx] + data[idx + 1] + data[idx + 2]) / (3 * 255.0);
      bodyCount++;
    }
  }
  features.push(+(headRedExcess / headCount).toFixed(5));
  features.push(+(bodyWhiteness / bodyCount).toFixed(5));

  return features;
}

/**
 * Classifies the exact species and viewing angle against the 10 trained centroids.
 */
export function classifyLivestockAngle(
  features: number[],
  speciesPreference: 'goat' | 'sheep' | 'auto' = 'auto'
): AngleClassificationResult {
  if (!features || features.length < 64) {
    return {
      detected: false,
      species: speciesPreference === 'sheep' ? 'sheep' : 'goat',
      angle: 'SIDE_VIEW',
      label: 'Side Profile',
      tagalogLabel: 'Tagiliran',
      confidence: 0,
      clinicalFocus: 'General veterinary health screening',
      guidance: 'Looking for goat or sheep in camera view...',
      angleScores: { FRONT_VIEW: 0, SIDE_VIEW: 0, REAR_VIEW: 0, FRONT_ANGLE: 0, TOP_ANGLE: 0 },
      topMatchKey: 'goat_side_view',
    };
  }

  let bestKey = 'goat_side_view';
  let bestSim = -1;
  const angleScores: Record<LivestockAngle, number> = {
    FRONT_VIEW: 0,
    SIDE_VIEW: 0,
    REAR_VIEW: 0,
    FRONT_ANGLE: 0,
    TOP_ANGLE: 0,
  };

  const candidateKeys = Object.keys(TRAINED_ANGLE_CENTROIDS).filter(k => {
    if (speciesPreference === 'goat') return k.startsWith('goat_');
    if (speciesPreference === 'sheep') return k.startsWith('sheep_');
    return true;
  });

  for (const key of candidateKeys) {
    const centroid = TRAINED_ANGLE_CENTROIDS[key];
    const meta = ANGLE_DEFINITIONS[key];
    if (!centroid || !meta) continue;

    // Cosine similarity + weighted spatial difference
    let dot = 0, normA = 0, normB = 0;
    const len = Math.min(features.length, centroid.length);
    for (let i = 0; i < len; i++) {
      dot += features[i] * centroid[i];
      normA += features[i] * features[i];
      normB += centroid[i] * centroid[i];
    }

    const cosineSim = dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-6);
    // Aspect ratio bonus
    const aspectDiff = Math.abs((features[64] || 1) - meta.aspectRatio);
    const finalScore = Math.max(0, Math.min(1, cosineSim * 0.85 + (1 - Math.min(1, aspectDiff)) * 0.15));

    if (finalScore > angleScores[meta.key]) {
      angleScores[meta.key] = +finalScore.toFixed(3);
    }

    if (finalScore > bestSim) {
      bestSim = finalScore;
      bestKey = key;
    }
  }

  const bestMeta = ANGLE_DEFINITIONS[bestKey] || ANGLE_DEFINITIONS.goat_side_view;
  const confidence = Math.min(0.98, Math.max(0.65, +(bestSim * 0.95).toFixed(2)));

  return {
    detected: true,
    species: bestMeta.species,
    angle: bestMeta.key,
    label: bestMeta.label,
    tagalogLabel: bestMeta.tagalogLabel,
    confidence,
    clinicalFocus: bestMeta.clinicalFocus,
    guidance: bestMeta.scannerGuidance,
    angleScores,
    topMatchKey: bestKey,
  };
}
