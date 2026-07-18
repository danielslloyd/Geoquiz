// Game state
let gameState = {
    score: 0,
    currentQuestion: 1,
    totalQuestions: 10,
    targetCountry: null,
    countries: [],
    answeredCorrectly: false,
    usedCountries: new Set(),
    questionType: null, // 'location', 'flag', 'capital', 'identify', 'name-all'
    currentAnswer: null,
    multipleChoiceOptions: [],
    subQuestionIndex: 0, // 0: location, 1: flag, 2: capital
    maxSubQuestions: 3,
    mode: 'countries', // 'countries', 'us-states', 'indian-states', 'name-all'
    currentDataObj: null, // Will be set based on mode
    currentQuizList: null, // Will be set based on mode
    foundCountries: new Set(), // For name-all mode
    nameAllStartTime: null, // Track start time for name-all mode
    nameAllGaveUp: false, // Track if user gave up in name-all mode
    scrollLocked: false, // Lock scrolling during quiz animations
    guessedThisQuestion: false // Track if a guess has been made for current question
};

// Sync score display between game-info panel and top bar
function syncScoreDisplay() {
    const si = document.getElementById('score-inline');
    const qi = document.getElementById('question-inline');
    const ti = document.getElementById('total-inline');
    if (si) si.textContent = gameState.score;
    if (qi) qi.textContent = gameState.currentQuestion;
    if (ti) ti.textContent = gameState.totalQuestions;
}

// Globe configuration
const width = 800;
const height = 600;
let projection, path, svg, g, countriesGroup;
let rotation = { x: 0, y: 0 };

// Data objects - loaded from JSON files
let countryData = {};
let usStateData = {};
let indianStateData = {};
let germanStateData = {};
let englandCountyData = {};
let mexicanStateData = {};

// When true, globe modes render as a flat Mercator map instead of an orthographic globe.
let flatGlobeView = false;

// Level-of-detail for world-atlas geometry. The detail toggle exposes three levels:
//   low    = 110m source
//   medium = 50m source, simplified client-side (sits between low and high)
//   high   = 50m source
// The 10m source is reserved for the Country Shape ID silhouette (highest possible
// detail for a single outline); the orbital view draws a Blue Marble texture instead,
// so it only needs coarse 110m countries for coast detection + its inset map.
let mapDetail = 'medium';
const DETAIL_RES = { low: '110m', medium: '50m', high: '50m' };
const DETAIL_ORDER = ['low', 'medium', 'high'];
// Fraction of the 50m geometry's points kept when deriving the 'medium' level via
// topojson simplification (1 = full detail, lower = coarser). Locked.
const MEDIUM_SIMPLIFY_RETAIN = 0.2;

// In-memory cache of fetched world-atlas topologies, keyed by URL, so the detail
// slider can re-simplify without re-downloading/re-parsing the source.
const worldTopoCache = {};
function fetchWorldTopo(url) {
    if (worldTopoCache[url]) return Promise.resolve(worldTopoCache[url]);
    return d3.json(url).then(d => { worldTopoCache[url] = d; return d; });
}

// Resolve the world countries TopoJSON URL for the active detail level.
function worldCountriesUrl() {
    const mc = QUIZ_MODES[gameState.mode];
    let res;
    if (mc && mc.spaceshipMode) res = '110m';             // only for coast detection + inset; the texture provides the visuals
    else if (mc && mc.countryShapeIdMode) res = '10m';    // max-resolution single-country silhouette
    else res = DETAIL_RES[mapDetail];
    return `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-${res}.json`;
}

// Convert a freshly-fetched world-atlas topology into country features, applying
// client-side simplification for the 'medium' detail level (which loads the 50m
// source). Modes that force their own resolution (spaceship, shape ID) skip it.
function worldFeaturesFromTopology(data) {
    const mc = QUIZ_MODES[gameState.mode];
    const forced = !!(mc && (mc.spaceshipMode || mc.countryShapeIdMode));
    let topo = data;
    if (!forced && mapDetail === 'medium' && topojson.presimplify && topojson.quantile) {
        // presimplify/simplify RETURN new topologies (they don't mutate the input),
        // so we must use the returned values — otherwise nothing is simplified.
        const pre = topojson.presimplify(data);
        const minWeight = topojson.quantile(pre, MEDIUM_SIMPLIFY_RETAIN);
        topo = topojson.simplify(pre, minWeight);
    }
    return topojson.feature(topo, topo.objects.countries).features;
}

// True only when the current mode is a globe mode AND the globe (orthographic) view is active.
function isGlobeView() {
    const mc = QUIZ_MODES[gameState.mode];
    return !!(mc && mc.useGlobe && !flatGlobeView);
}

// Load and validate all data files
async function initializeGameData() {
  try {
    const dataFiles = [
      { key: 'countryData', path: 'data/countries.json' },
      { key: 'usStateData', path: 'data/us-states.json' },
      { key: 'indianStateData', path: 'data/indian-states.json' },
      { key: 'germanStateData', path: 'data/german-states.json' },
      { key: 'englandCountyData', path: 'data/england-counties.json' },
      { key: 'mexicanStateData', path: 'data/mexico-states.json' },
      { key: 'continentData', path: 'data/continents.json' },
      { key: 'skylineCityData', path: 'data/skyline-cities.json' }
    ];

    for (const file of dataFiles) {
      const response = await fetch(file.path);
      if (!response.ok) throw new Error(`Failed to load ${file.path}: HTTP ${response.status}`);
      const data = await response.json();

      // Basic validation
      if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        throw new Error(`${file.path} contains invalid data`);
      }

      window[file.key] = data;
      console.log(`Loaded ${file.key}: ${Object.keys(data).length} entries`);
    }

    console.log('✓ All game data loaded and validated');
    return true;
  } catch (error) {
    console.error('Failed to load game data:', error);
    const errorMsg = `Error loading game data: ${error.message}\n\nPlease refresh the page.`;
    console.error(errorMsg);
    alert(errorMsg);
    return false;
  }
}

// List of countries for the quiz (comprehensive list of 195 recognized countries)
const quizCountries = [
    'United States of America', 'Canada', 'Mexico', 'Brazil', 'Argentina',
    'United Kingdom', 'France', 'Germany', 'Spain', 'Italy', 'Russia',
    'China', 'Japan', 'India', 'Australia', 'South Africa',
    'Egypt', 'Nigeria', 'Saudi Arabia', 'Turkey', 'Greece',
    'Norway', 'Sweden', 'Poland', 'Ukraine', 'South Korea',
    'Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'New Zealand',
    'Chile', 'Peru', 'Colombia', 'Venezuela', 'Portugal',
    'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Denmark',
    'Finland', 'Ireland', 'Iceland', 'Morocco', 'Algeria',
    'Kenya', 'Ethiopia', 'Iran', 'Iraq', 'Pakistan',
    'Bangladesh', 'Myanmar', 'Malaysia', 'Singapore', 'Cuba',
    'Jamaica', 'Panama', 'Costa Rica', 'Dominican Republic', 'Guatemala',
    // Additional countries
    'Afghanistan', 'Albania', 'Angola', 'Antigua and Barbuda', 'Armenia',
    'Azerbaijan', 'Bahamas', 'Bahrain', 'Barbados', 'Belarus',
    'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina',
    'Botswana', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
    'Cambodia', 'Cameroon', 'Cape Verde', 'Central African Republic', 'Chad',
    'Comoros', 'Republic of the Congo', 'Democratic Republic of the Congo', 'Croatia', 'Cyprus',
    'Czechia', 'Djibouti', 'Dominica', 'Ecuador', 'El Salvador',
    'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Fiji',
    'Gabon', 'Gambia', 'Georgia', 'Ghana', 'Grenada',
    'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras',
    'Hungary', 'Jordan', 'Kazakhstan', 'Kiribati', 'Kuwait',
    'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho',
    'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
    'Madagascar', 'Malawi', 'Maldives', 'Mali', 'Malta',
    'Mauritania', 'Mauritius', 'Micronesia', 'Moldova', 'Monaco',
    'Mongolia', 'Montenegro', 'Mozambique', 'Namibia', 'Nauru',
    'Nepal', 'Nicaragua', 'Niger', 'North Korea', 'North Macedonia',
    'Oman', 'Palestine', 'Papua New Guinea', 'Paraguay', 'Qatar',
    'Romania', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines',
    'Samoa', 'San Marino', 'Sao Tome and Principe',
    'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Slovakia',
    'Slovenia', 'Solomon Islands', 'Somalia', 'South Sudan', 'Sri Lanka',
    'Sudan', 'Suriname', 'Syria', 'Tajikistan', 'Tanzania',
    'East Timor', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia',
    'Turkmenistan', 'Tuvalu', 'Uganda', 'United Arab Emirates', 'Uruguay',
    'Uzbekistan', 'Vanuatu', 'Vatican City', 'Yemen', 'Zambia', 'Zimbabwe',
    // Previously missing sovereign / de-facto states
    'Israel', 'Ivory Coast', 'Taiwan', 'Kosovo'
];

// Enhanced country data with capitals, flags, and similar countries for tricky distractors

// ==================== REGIONS DATA ====================

// US STATES
const usStates = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California',
    'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
    'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
    'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
    'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
    'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
    'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
    'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
    'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
    'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
    'Puerto Rico'
];


// INDIAN STATES AND UNION TERRITORIES
const indianStates = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

// GERMAN STATES
const germanStates = [
    'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen',
    'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen',
    'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'
];


// England ceremonial counties (identify-only; data loaded from data/england-counties.json)
const englandCounties = [
    'Bedfordshire', 'Berkshire', 'Bristol', 'Buckinghamshire', 'Cambridgeshire',
    'Cheshire', 'Cornwall', 'Cumbria', 'Derbyshire', 'Devon',
    'Dorset', 'Durham', 'East Riding of Yorkshire', 'East Sussex', 'Essex',
    'Gloucestershire', 'Greater London', 'Greater Manchester', 'Hampshire', 'Herefordshire',
    'Hertfordshire', 'Isle of Wight', 'Kent', 'Lancashire', 'Leicestershire',
    'Lincolnshire', 'Merseyside', 'Norfolk', 'North Yorkshire', 'Northamptonshire',
    'Northumberland', 'Nottinghamshire', 'Oxfordshire', 'Rutland', 'Shropshire',
    'Somerset', 'South Yorkshire', 'Staffordshire', 'Suffolk', 'Surrey',
    'Tyne and Wear', 'Warwickshire', 'West Midlands', 'West Sussex', 'West Yorkshire',
    'Wiltshire', 'Worcestershire'
];

// Mexican states (names match data/mexico-states.geo.json exactly, incl. accents)
const mexicanStates = [
    'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
    'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango',
    'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán',
    'Morelos', 'México', 'Nayarit', 'Nuevo León', 'Oaxaca',
    'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa',
    'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz',
    'Yucatán', 'Zacatecas'
];

// ==================== ORDERING & SORTING UTILITIES ====================

// Modular scoring function for pair-wise ordering
// Returns a score based on how many pairs of items are in the correct relative order
function calculatePairwiseScore(userOrder, correctOrder, getValueFn = null) {
    if (userOrder.length !== correctOrder.length) {
        console.error('User order and correct order must have the same length');
        return 0;
    }

    // Create a map of item to its correct index
    const correctIndexMap = new Map();
    correctOrder.forEach((item, index) => {
        correctIndexMap.set(item, index);
    });

    // Count correct pairs
    let correctPairs = 0;
    let totalPairs = 0;

    // Check every pair (i, j) where i < j
    for (let i = 0; i < userOrder.length - 1; i++) {
        for (let j = i + 1; j < userOrder.length; j++) {
            const item1 = userOrder[i];
            const item2 = userOrder[j];

            const correctIndex1 = correctIndexMap.get(item1);
            const correctIndex2 = correctIndexMap.get(item2);

            // Check if the relative order is correct
            if (correctIndex1 < correctIndex2) {
                correctPairs++;
            }
            totalPairs++;
        }
    }

    // Return percentage of correct pairs
    return Math.round((correctPairs / totalPairs) * 100);
}

// Reusable drag-to-reorder component
class DragToReorder {
    constructor(containerElement, items, options = {}) {
        this.container = containerElement;
        this.items = items;  // Array of {id, content, data}
        this.options = {
            onOrderChange: options.onOrderChange || (() => {}),
            itemClass: options.itemClass || 'draggable-item',
            dragClass: options.dragClass || 'dragging',
            overClass: options.overClass || 'drag-over',
            ...options
        };

        this.draggedElement = null;
        this.init();
    }

    init() {
        this.render();
        this.attachEventListeners();
    }

    render() {
        this.container.innerHTML = '';
        this.items.forEach((item, index) => {
            const element = document.createElement('div');
            element.className = this.options.itemClass;
            element.draggable = true;
            element.dataset.itemId = item.id;
            element.dataset.index = index;

            if (typeof item.content === 'string') {
                element.innerHTML = item.content;
            } else {
                element.appendChild(item.content);
            }

            this.container.appendChild(element);
        });
    }

    attachEventListeners() {
        const elements = this.container.querySelectorAll(`.${this.options.itemClass}`);

        elements.forEach(element => {
            element.addEventListener('dragstart', (e) => this.handleDragStart(e));
            element.addEventListener('dragover', (e) => this.handleDragOver(e));
            element.addEventListener('drop', (e) => this.handleDrop(e));
            element.addEventListener('dragend', (e) => this.handleDragEnd(e));
            element.addEventListener('dragenter', (e) => this.handleDragEnter(e));
            element.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        });
    }

    handleDragStart(e) {
        this.draggedElement = e.target;
        e.target.classList.add(this.options.dragClass);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target.innerHTML);
    }

    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    handleDragEnter(e) {
        if (e.target.classList.contains(this.options.itemClass)) {
            e.target.classList.add(this.options.overClass);
        }
    }

    handleDragLeave(e) {
        if (e.target.classList.contains(this.options.itemClass)) {
            e.target.classList.remove(this.options.overClass);
        }
    }

    handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        e.preventDefault();

        if (this.draggedElement !== e.target && e.target.classList.contains(this.options.itemClass)) {
            // Capture old positions before reordering
            const oldPositions = new Map();
            this.container.querySelectorAll(`.${this.options.itemClass}`).forEach(el => {
                const id = el.dataset.itemId;
                oldPositions.set(id, el.getBoundingClientRect());
            });

            // Reorder items array
            const draggedIndex = parseInt(this.draggedElement.dataset.index);
            const targetIndex = parseInt(e.target.dataset.index);

            // Move the item
            const temp = this.items[draggedIndex];
            this.items.splice(draggedIndex, 1);
            this.items.splice(targetIndex, 0, temp);

            // Re-render
            this.render();
            this.attachEventListeners();

            // Animate items to their new positions
            this.container.querySelectorAll(`.${this.options.itemClass}`).forEach(el => {
                const id = el.dataset.itemId;
                const oldPos = oldPositions.get(id);
                if (oldPos) {
                    const newPos = el.getBoundingClientRect();
                    const offsetX = oldPos.left - newPos.left;
                    const offsetY = oldPos.top - newPos.top;

                    if (offsetX !== 0 || offsetY !== 0) {
                        el.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
                        el.style.transition = 'none';
                        el.offsetHeight; // trigger reflow
                        el.style.transition = 'transform 0.3s ease-out';
                        el.style.transform = 'translate(0, 0)';
                    }
                }
            });

            // Callback
            this.options.onOrderChange(this.getCurrentOrder());
        }

        e.target.classList.remove(this.options.overClass);
        return false;
    }

    handleDragEnd(e) {
        e.target.classList.remove(this.options.dragClass);
        const elements = this.container.querySelectorAll(`.${this.options.itemClass}`);
        elements.forEach(el => el.classList.remove(this.options.overClass));
    }

    getCurrentOrder() {
        return this.items.map(item => item.id);
    }

    getItems() {
        return this.items;
    }
}

// Quiz mode configurations
const QUIZ_MODES = {
    countries: {
        name: 'Countries of the World',
        quizList: quizCountries,
        dataObjKey: 'countryData',
        totalQuestions: 10,
        useGlobe: true,
        mapUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
        mapObject: 'countries',
        hasFlags: true,
        itemLabel: 'country',
        itemLabelPlural: 'countries',
        autoRotate: false, // Don't auto-rotate to country
        useWorldQuizLayout: true // Use special 2/3 + 1/3 layout
    },
    'us-states': {
        name: 'US States',
        quizList: usStates,
        dataObjKey: 'usStateData',
        totalQuestions: usStates.length,
        useGlobe: false,
        useAlbersUsa: true,
        mapUrl: 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json',
        mapObject: 'states',
        hasFlags: false,
        itemLabel: 'state',
        itemLabelPlural: 'states',
        autoRotate: false
    },
    'indian-states': {
        name: 'Indian States',
        quizList: indianStates,
        dataObjKey: 'indianStateData',
        totalQuestions: indianStates.length,
        useGlobe: false,
        mapUrl: 'https://raw.githubusercontent.com/Subhash9325/GeoJson-Data-of-Indian-States/master/Indian_States',
        mapObject: null, // Will use features directly
        hasFlags: false,
        itemLabel: 'state',
        itemLabelPlural: 'states',
        autoRotate: false
    },
    'identify': {
        name: 'Identify Mode',
        quizList: quizCountries, // Will be set dynamically
        dataObjKey: 'countryData', // Will be set dynamically
        totalQuestions: 10,
        useGlobe: true, // Will be set dynamically
        mapUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json', // Will be set dynamically
        mapObject: 'countries', // Will be set dynamically
        hasFlags: false,
        itemLabel: 'location',
        itemLabelPlural: 'locations',
        autoRotate: true, // Auto-rotate for identify mode
        identifyOnly: true // Only show identify questions
    },
    'name-all': {
        name: 'Name All Countries',
        quizList: quizCountries,
        dataObjKey: 'countryData',
        totalQuestions: 1, // Single question mode
        useGlobe: true,
        mapUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
        mapObject: 'countries',
        hasFlags: false,
        itemLabel: 'country',
        itemLabelPlural: 'countries',
        autoRotate: false,
        nameAllMode: true // Special mode for typing all countries
    },
    'german-states': {
        name: 'German States',
        quizList: germanStates,
        dataObjKey: 'germanStateData',
        totalQuestions: germanStates.length,
        useGlobe: false,
        mapUrl: '4_niedrig.geo.json',
        mapObject: null,
        hasFlags: false,
        itemLabel: 'state',
        itemLabelPlural: 'states',
        autoRotate: false
    },
    'uk-states': {
        name: 'England Counties',
        quizList: englandCounties,
        dataObjKey: 'englandCountyData',
        totalQuestions: englandCounties.length,
        useGlobe: false,
        mapUrl: 'data/england-counties.geo.json',
        mapObject: null,
        hasFlags: false,
        findOnly: true, // Find the county on the map only — no capital sub-question
        itemLabel: 'county',
        itemLabelPlural: 'counties',
        autoRotate: false
    },
    'mexican-states': {
        name: 'Mexican States',
        quizList: mexicanStates,
        dataObjKey: 'mexicanStateData',
        totalQuestions: mexicanStates.length,
        useGlobe: false,
        mapUrl: 'data/mexico-states.geo.json',
        mapObject: null,
        hasFlags: false,
        itemLabel: 'state',
        itemLabelPlural: 'states',
        autoRotate: false
    },
    'population-order': {
        name: 'Order by Population',
        quizList: quizCountries,
        dataObjKey: 'countryData',
        totalQuestions: 10,
        useGlobe: false,
        hasFlags: false,
        itemLabel: 'country',
        itemLabelPlural: 'countries',
        autoRotate: false,
        orderingMode: true, // Special mode for ordering
        orderingCriteria: 'population'
    },
    'mystery-flag': {
        name: 'Mystery Flag',
        quizList: quizCountries,
        dataObjKey: 'countryData',
        totalQuestions: 10,
        useGlobe: true,
        mapUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
        mapObject: 'countries',
        hasFlags: true,
        itemLabel: 'country',
        itemLabelPlural: 'countries',
        autoRotate: false,
        mysteryFlagMode: true // Show flag, click globe to find country
    },
    'capitals-race': {
        name: 'Capitals Race',
        quizList: quizCountries,
        dataObjKey: 'countryData',
        totalQuestions: 10,
        useGlobe: true,
        mapUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
        mapObject: 'countries',
        hasFlags: false,
        itemLabel: 'country',
        itemLabelPlural: 'countries',
        autoRotate: true,
        capitalsRaceMode: true // Show country on globe, type the capital
    },
    'free-explore': {
        name: 'Free Explore',
        quizList: quizCountries,
        dataObjKey: 'countryData',
        totalQuestions: 1,
        useGlobe: true,
        mapUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
        mapObject: 'countries',
        hasFlags: true,
        itemLabel: 'country',
        itemLabelPlural: 'countries',
        autoRotate: false,
        freeExploreMode: true // Interactive globe exploration mode
    },
    'country-shape-id': {
        name: 'Country Shape ID',
        quizList: quizCountries,
        dataObjKey: 'countryData',
        totalQuestions: 10,
        useGlobe: false, // flat Mercator silhouette of a single country — no globe
        mapUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json',
        mapObject: 'countries',
        hasFlags: false,
        itemLabel: 'country',
        itemLabelPlural: 'countries',
        autoRotate: false,
        countryShapeIdMode: true // Identify country by shape with multiple choice
    },
    'find-capital': {
        name: 'Find the Capital',
        quizList: quizCountries,
        dataObjKey: 'countryData',
        totalQuestions: 10,
        useGlobe: false,
        mapUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
        mapObject: 'countries',
        hasFlags: false,
        itemLabel: 'capital',
        itemLabelPlural: 'capitals',
        autoRotate: false,
        findCapitalMode: true // Show a capital name, click the map to guess its location
    },
    'spaceship': {
        name: 'Where Is My Spaceship?',
        quizList: quizCountries,
        dataObjKey: 'countryData',
        totalQuestions: 10,
        useGlobe: true,
        mapUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
        mapObject: 'countries',
        hasFlags: false,
        itemLabel: 'location',
        itemLabelPlural: 'locations',
        autoRotate: false,
        spaceshipMode: true // Frozen LEO globe view; guess the location on an inset map
    },
    'skyline-id': {
        name: 'Skyline ID',
        // A getter, not an array: QUIZ_MODES is built while this file parses, but the city
        // list only arrives with the data/*.json fetches, so a literal would always be empty.
        get quizList() { return Object.keys(window.skylineCityData || {}); },
        dataObjKey: 'skylineCityData',
        totalQuestions: 10,
        useGlobe: false,   // no map at all — the photo IS the question
        hasFlags: false,
        itemLabel: 'city',
        itemLabelPlural: 'cities',
        autoRotate: false,
        skylineIdMode: true // Show a city skyline photo, pick the city from 4 choices
    }
};

// Compare place names ignoring case and diacritics. The world-atlas geometry can
// carry accented names (e.g. "São Tomé and Principe") while our data keys / quiz
// lists are plain ASCII ("Sao Tome and Principe"); this bridges the two.
function normalizeName(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function namesMatch(a, b) {
    return normalizeName(a) === normalizeName(b);
}
// Look up a data-object entry tolerant of diacritic/case differences.
function lookupDataEntry(name, dataObj) {
    if (!dataObj) return null;
    if (dataObj[name]) return dataObj[name];
    const norm = normalizeName(name);
    const key = Object.keys(dataObj).find(k => normalizeName(k) === norm);
    return key ? dataObj[key] : null;
}

// Helper function to get flag URL for a country
function getFlagUrl(itemName) {
    const data = gameState.currentDataObj[itemName];
    if (!data) {
        console.warn(`No data found for item: ${itemName}`);
        return null;
    }
    const flagUrl = `https://flagcdn.com/${data.code}.svg`;
    console.log(`Flag URL for ${itemName}: ${flagUrl}`);
    return flagUrl;
}

// Helper function to get capital for a country/state
function getCapital(itemName) {
    const data = gameState.currentDataObj[itemName];
    return data ? data.capital : null;
}

// Generate multiple choice options with tricky distractors
function generateMultipleChoiceOptions(correctAnswer, answerType = 'item') {
    const options = [correctAnswer];
    const data = gameState.currentDataObj[correctAnswer];
    const currentList = gameState.currentQuizList;

    // Get similar items for tricky distractors
    let similarItems = [];
    if (data && data.similar) {
        similarItems = data.similar.filter(item => {
            // Ensure the similar item is in our quiz list
            return currentList.includes(item);
        });
    }

    // Add at least one similar item if available
    if (similarItems.length > 0) {
        const randomSimilar = similarItems[Math.floor(Math.random() * similarItems.length)];
        options.push(randomSimilar);
    }

    // Fill remaining options with random items
    while (options.length < 4) {
        const randomItem = currentList[Math.floor(Math.random() * currentList.length)];
        if (!options.includes(randomItem)) {
            options.push(randomItem);
        }
    }

    // For capital questions, return the capitals instead of item names
    if (answerType === 'capital') {
        return options.map(item => getCapital(item)).filter(cap => cap !== null);
    }

    // Shuffle the options
    return shuffleArray(options);
}

// Helper function to shuffle an array
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Render multiple choice options
function renderMultipleChoice(options, correctAnswer) {
    const container = document.getElementById('options-grid');
    container.innerHTML = '';
    container.className = 'options-grid'; // Ensure correct class for button layout

    options.forEach(option => {
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.textContent = option;
        button.onclick = () => handleMultipleChoiceAnswer(option, correctAnswer, button);
        container.appendChild(button);
    });

    // Show multiple choice container
    document.getElementById('multiple-choice-container').classList.remove('hidden');
}

// Handle multiple choice answer
function handleMultipleChoiceAnswer(selectedAnswer, correctAnswer, button) {
    if (gameState.answeredCorrectly) return;

    const isCorrect = selectedAnswer === correctAnswer;

    // Visual feedback
    button.classList.add('selected');

    if (isCorrect) {
        button.classList.add('correct');
        handleCorrectAnswer(button);
        // Highlight correct country on globe if applicable
        if (gameState.questionType === 'identify') {
            highlightCountryOnGlobe(gameState.targetCountry);
        }
    } else {
        button.classList.add('incorrect');
        handleIncorrectAnswer(button);
        scheduleWrongThenCorrect(() => {
            let correctButton = null;
            document.querySelectorAll('.option-btn').forEach(btn => {
                if (btn.textContent === correctAnswer) {
                    btn.classList.add('correct');
                    correctButton = btn;
                }
            });
            return correctButton;
        });
    }
}

// Store the spinning animation interval for identify mode
let globeSpinInterval = null;

// Stop globe spinning animation
function stopGlobeSpin() {
    if (globeSpinInterval) {
        clearInterval(globeSpinInterval);
        globeSpinInterval = null;
    }
}

// Start slow eastward globe spin (for identify mode)
function startGlobeSpin(speed = 0.2) {
    if (!isGlobeView()) return; // Spinning only applies to the orthographic globe
    stopGlobeSpin(); // Clear any existing spin

    const spinStep = () => {
        const [lon, lat, roll] = projection.rotate();
        // Increment longitude to spin east (right)
        projection.rotate([lon + speed, lat, roll || 0]);
        countriesGroup.selectAll('path').attr('d', path);
        updateIslandMarkers(); // keep dots + lakes rotating with the land
    };

    // Spin every 50ms for smooth animation
    globeSpinInterval = setInterval(spinStep, 50);
}

// True when a feature IS `countryName` or is one of its overseas territories, so
// naming/finding a parent fills the parent and all its dependencies together.
function featureBelongsTo(d, countryName) {
    return !!(d && d.properties &&
        (d.properties.name === countryName || d.properties.parent === countryName));
}

// Raise highlighted paths so their outline paints ON TOP of neighbouring
// countries — otherwise a later-drawn neighbour clips the highlight's border.
function raiseHighlight(selection) {
    if (selection && !selection.empty()) selection.raise();
}

// Highlight country on globe (plus any of its overseas territories).
function highlightCountryOnGlobe(countryName) {
    const paths = countriesGroup.selectAll('path')
        .filter(d => featureBelongsTo(d, countryName))
        .classed('target', true);
    raiseHighlight(paths);

    // Island nations are dots, not polygons — highlight the marker too.
    if (islandMarkersGroup) {
        const dots = islandMarkersGroup.selectAll('circle')
            .filter(d => featureBelongsTo(d, countryName))
            .classed('target', true);
        raiseHighlight(dots);
    }
}

// Paint a country's shape(s) with its own flag (used once its flag sub-question has been
// asked). An objectBoundingBox pattern maps the flag into each feature's bounding box, so
// the fill automatically follows the country as the globe rotates/zooms. Parent + overseas
// territories all get the parent's flag.
function fillCountryWithFlag(countryName) {
    if (!svg || !countriesGroup) return;
    const data = gameState.currentDataObj && gameState.currentDataObj[countryName];
    if (!data || !data.code) return;
    const url = `https://flagcdn.com/${data.code}.svg`;
    const patId = 'flagfill-' + data.code;

    let defs = svg.select('defs');
    if (defs.empty()) defs = svg.append('defs');
    if (defs.select('#' + patId).empty()) {
        const pat = defs.append('pattern')
            .attr('id', patId)
            .attr('patternUnits', 'objectBoundingBox')
            .attr('patternContentUnits', 'objectBoundingBox')
            .attr('width', 1).attr('height', 1);
        pat.append('image')
            .attr('href', url).attr('xlink:href', url)   // href + legacy xlink:href for older renderers
            .attr('width', 1).attr('height', 1)
            .attr('preserveAspectRatio', 'xMidYMid slice');
    }

    const fill = `url(#${patId})`;
    countriesGroup.selectAll('path')
        .filter(d => featureBelongsTo(d, countryName))
        .style('fill', fill)
        .classed('flag-filled', true);
    if (islandMarkersGroup) {
        islandMarkersGroup.selectAll('circle')
            .filter(d => featureBelongsTo(d, countryName))
            .style('fill', fill)
            .classed('flag-filled', true);
    }
}

// Clear multiple choice UI
function clearMultipleChoice() {
    const grid = document.getElementById('options-grid');
    grid.innerHTML = '';
    grid.className = 'options-grid'; // Reset to default class
    document.getElementById('multiple-choice-container').classList.add('hidden');
    document.getElementById('flag-display').style.display = 'none';
    const skyline = document.getElementById('skyline-display');
    if (skyline) skyline.style.display = 'none';
}

// Initialize the game
async function initGame() {
    // Load and validate all game data first
    const dataLoaded = await initializeGameData();
    if (!dataLoaded) return;

    setupEventListeners();
}

// Start game with selected mode
function startGameWithMode(mode) {
    // Reset all game state
    stopNameAllTimer(); // cancel any running name-all countdown before resetting state
    removeSpaceshipInset(); // clear the spaceship guess inset from any prior game
    disposeOrbital();       // tear down any prior orbital WebGL canvas
    const modeConfig = QUIZ_MODES[mode];
    // Mark the spaceship view so the mobile layout can split into earth + guess map.
    document.body.classList.toggle('spaceship-active', !!modeConfig.spaceshipMode);
    // Globe modes (but not spaceship, which has its own bespoke inset layout) get the
    // map/globe maximised with question/flag/multiple-choice in a narrow side panel —
    // see .globe-layout/.globe-side-panel in style.css.
    document.querySelector('.container').classList.toggle(
        'globe-side-layout', !!modeConfig.useGlobe && !modeConfig.spaceshipMode);
    gameState = {
        score: 0,
        currentQuestion: 1,
        totalQuestions: modeConfig.totalQuestions,
        targetCountry: null,
        countries: [],
        answeredCorrectly: false,
        usedCountries: new Set(),
        questionType: null,
        currentAnswer: null,
        multipleChoiceOptions: [],
        subQuestionIndex: 0,
        maxSubQuestions: 3,
        mode: mode,
        currentDataObj: null,
        currentQuizList: null,
        foundCountries: new Set(),
        nameAllStartTime: null,
        nameAllGaveUp: false
    };

    // Set current data sources
    gameState.currentDataObj = window[modeConfig.dataObjKey] || {};
    gameState.currentQuizList = modeConfig.quizList;
    console.log(`Mode: ${mode}, DataObj keys: ${Object.keys(gameState.currentDataObj).length}, Sample keys: ${Object.keys(gameState.currentDataObj).slice(0, 5)}`);

    // Clear any previous game state messages
    const feedback = document.getElementById('feedback');
    feedback.textContent = '';
    feedback.className = 'feedback';
    document.getElementById('question-text').innerHTML = '';

    // Clear dynamically appended content from question-container
    const orderingContainer = document.getElementById('ordering-container');
    if (orderingContainer) orderingContainer.remove();
    const nameAllInputContainer = document.getElementById('name-all-input-container');
    if (nameAllInputContainer) nameAllInputContainer.remove();
    const capitalsRaceInputContainer = document.getElementById('capitals-race-input-container');
    if (capitalsRaceInputContainer) capitalsRaceInputContainer.remove();

    // Clear world quiz feedback
    const flagFeedback = document.getElementById('flag-feedback');
    if (flagFeedback) {
        flagFeedback.textContent = '';
        flagFeedback.className = 'feedback';
    }
    const capitalFeedback = document.getElementById('capital-feedback');
    if (capitalFeedback) {
        capitalFeedback.textContent = '';
        capitalFeedback.className = 'feedback';
    }

    // Update score display
    document.getElementById('score').textContent = '0'; syncScoreDisplay();
    document.getElementById('current-question').textContent = '1';

    // Hide mode selector and show game elements with top bar
    document.getElementById('mode-selector').classList.add('hidden');
    document.getElementById('states-selector').classList.add('hidden');
    document.getElementById('landing-header').style.display = 'none';
    document.getElementById('top-bar').style.display = '';
    document.getElementById('controls').classList.remove('hidden');
    syncScoreDisplay();

    // Show gamma lock toggle only for the orthographic globe view (not the fixed spaceship view)
    const gammaToggle = document.getElementById('gamma-lock-toggle');
    gammaToggle.style.display = (isGlobeView() && !modeConfig.spaceshipMode) ? '' : 'none';
    gammaToggle.textContent = gammaLocked ? 'Tilt: Locked' : 'Tilt: Free';

    // Detail toggle: only for world (countries) maps that follow the global detail
    // level — not the spaceship close-up or the fixed-detail shape silhouette.
    const detailToggle = document.getElementById('detail-toggle');
    if (detailToggle) {
        detailToggle.style.display = (modeConfig.mapObject === 'countries' && !modeConfig.spaceshipMode && !modeConfig.countryShapeIdMode) ? '' : 'none';
        detailToggle.textContent = 'Detail: ' + mapDetail.charAt(0).toUpperCase() + mapDetail.slice(1);
    }

    // Orbital tuning (altitude + scoring weights): only for the orbital view.
    const spaceshipTuning = document.getElementById('spaceship-tuning');
    if (spaceshipTuning) spaceshipTuning.style.display = modeConfig.spaceshipMode ? '' : 'none';

    // Country-outline hint button: shown only in the spaceship view; label reflects state.
    const hintBtn = document.getElementById('hint-outlines-toggle');
    if (hintBtn) {
        hintBtn.style.display = modeConfig.spaceshipMode ? '' : 'none';
        hintBtn.textContent = 'Outlines: ' + (orbitalHintOn ? 'On' : 'Off');
    }

    // Show the projection (globe/flat) toggle only for globe-capable modes
    const projToggle = document.getElementById('projection-toggle');
    if (projToggle) {
        projToggle.style.display = (modeConfig.useGlobe && !modeConfig.spaceshipMode) ? '' : 'none';
        projToggle.textContent = flatGlobeView ? 'View: Map' : 'View: Globe';
    }

    // Reset the debug overlay for each new game
    debugValidityOn = false;
    const debugToggle = document.getElementById('debug-validity-toggle');
    if (debugToggle) debugToggle.textContent = 'Debug: Off';

    // Show appropriate layout based on mode
    if (modeConfig.useWorldQuizLayout) {
        // Use World Quiz Layout (globe left 2/3, questions right 1/3)
        document.getElementById('world-quiz-layout').classList.remove('hidden');
        document.getElementById('world-quiz-question-bar').classList.remove('hidden');
        document.getElementById('question-container').classList.add('hidden');
        document.getElementById('multiple-choice-container').classList.add('hidden');
        document.getElementById('map-container').classList.add('hidden');

    } else {
        // Use standard layout
        document.getElementById('question-container').classList.remove('hidden');
        document.getElementById('map-container').classList.remove('hidden');

        document.getElementById('world-quiz-layout').classList.add('hidden');
        document.getElementById('world-quiz-question-bar').classList.add('hidden');
    }

    // Setup visualization based on mode
    // Skip map loading for the map-less modes (ordering, skyline photos)
    if (modeConfig.orderingMode || modeConfig.skylineIdMode) {
        startNewQuestion();
    } else {
        if (modeConfig.spaceshipMode) flatGlobeView = false; // always orthographic for the LEO view
        setupGlobe();
        loadMapData();
    }
}

// Custom AlbersUSA composite projection that includes a Puerto Rico inset.
// Based on https://observablehq.com/@d3/u-s-map-with-puerto-rico
function geoAlbersUsaPr() {
    const ε = 1e-6;

    const lower48   = d3.geoAlbers();
    const alaska    = d3.geoConicEqualArea().rotate([154, 0]).center([-2,   58.5]).parallels([55, 65]);
    const hawaii    = d3.geoConicEqualArea().rotate([157, 0]).center([-3,   19.9]).parallels([ 8, 18]);
    const puertoRico= d3.geoConicEqualArea().rotate([ 66, 0]).center([ 0,   18  ]).parallels([ 8, 18]);

    // pointStream pattern: calling a sub-projection's stream with this sink lets us
    // test whether a lat/lon falls inside that sub-projection's clipExtent.
    let point;
    const pointStream = { point(x, y) { point = [x, y]; } };
    let lower48Point, alaskaPoint, hawaiiPoint, puertoRicoPoint;

    let cache, cacheStream;

    function multiplex(streams) {
        const n = streams.length;
        return {
            point(x, y)     { for (let i = 0; i < n; i++) streams[i].point(x, y); },
            sphere()         { for (let i = 0; i < n; i++) streams[i].sphere(); },
            lineStart()      { for (let i = 0; i < n; i++) streams[i].lineStart(); },
            lineEnd()        { for (let i = 0; i < n; i++) streams[i].lineEnd(); },
            polygonStart()   { for (let i = 0; i < n; i++) streams[i].polygonStart(); },
            polygonEnd()     { for (let i = 0; i < n; i++) streams[i].polygonEnd(); }
        };
    }

    function reset() { cache = cacheStream = null; return albersUsaPr; }

    // The projection callable: routes a [lon,lat] to the correct inset.
    function albersUsaPr(coordinates) {
        const x = coordinates[0], y = coordinates[1];
        return (point = null,
            (lower48Point.point(x, y),    point) ||
            (alaskaPoint.point(x, y),     point) ||
            (hawaiiPoint.point(x, y),     point) ||
            (puertoRicoPoint.point(x, y), point));
    }

    albersUsaPr.invert = function(coordinates) {
        const k = lower48.scale();
        const t = lower48.translate();
        const x = (coordinates[0] - t[0]) / k;
        const y = (coordinates[1] - t[1]) / k;
        return (y >= 0.120 && y < 0.234 && x >= -0.425 && x < -0.214 ? alaska
              : y >= 0.166 && y < 0.234 && x >= -0.214 && x < -0.115 ? hawaii
              : y >= 0.166 && y < 0.234 && x >=  0.320 && x <  0.380 ? puertoRico
              : lower48).invert(coordinates);
    };

    albersUsaPr.stream = function(output) {
        if (cache && cacheStream === output) return cache;
        cache = multiplex([
            lower48.stream(output),
            alaska.stream(output),
            hawaii.stream(output),
            puertoRico.stream(output)
        ]);
        cacheStream = output;
        return cache;
    };

    albersUsaPr.precision = function(_) {
        if (!arguments.length) return lower48.precision();
        lower48.precision(_); alaska.precision(_); hawaii.precision(_); puertoRico.precision(_);
        return reset();
    };

    albersUsaPr.scale = function(_) {
        if (!arguments.length) return lower48.scale();
        const k = +_;
        lower48.scale(k);
        alaska.scale(k * 0.35);
        hawaii.scale(k);
        puertoRico.scale(k * 1.5);
        return albersUsaPr.translate(lower48.translate());
    };

    albersUsaPr.translate = function(_) {
        if (!arguments.length) return lower48.translate();
        const k = lower48.scale();
        const x = +_[0], y = +_[1];

        lower48Point = lower48
            .translate([x, y])
            .clipExtent([[x - 0.455*k + ε, y - 0.238*k + ε], [x + 0.455*k - ε, y + 0.238*k - ε]])
            .stream(pointStream);

        alaskaPoint = alaska
            .translate([x - 0.307*k, y + 0.201*k])
            .clipExtent([[x - 0.425*k + ε, y + 0.120*k + ε], [x - 0.214*k - ε, y + 0.234*k - ε]])
            .stream(pointStream);

        hawaiiPoint = hawaii
            .translate([x - 0.205*k, y + 0.212*k])
            .clipExtent([[x - 0.214*k + ε, y + 0.166*k + ε], [x - 0.115*k - ε, y + 0.234*k - ε]])
            .stream(pointStream);

        puertoRicoPoint = puertoRico
            .translate([x + 0.350*k, y + 0.212*k])
            .clipExtent([[x + 0.320*k + ε, y + 0.166*k + ε], [x + 0.380*k - ε, y + 0.234*k - ε]])
            .stream(pointStream);

        return reset();
    };

    albersUsaPr.fitExtent = function(extent, object) {
        const w = extent[1][0] - extent[0][0];
        const h = extent[1][1] - extent[0][1];

        // Reset to reference scale/translate so sub-projection clipExtents are well-defined
        albersUsaPr.scale(150).translate([0, 0]);

        // Compute the bounding box of all projected features
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        d3.geoStream(object, albersUsaPr.stream({
            point(x, y) {
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            },
            lineStart(){}, lineEnd(){}, polygonStart(){}, polygonEnd(){}, sphere(){}
        }));

        if (x1 < x0) return albersUsaPr; // nothing projected

        const k = 0.95 * Math.min(w / (x1 - x0), h / (y1 - y0));
        const tx = +extent[0][0] + (w - k * (x1 + x0)) / 2;
        const ty = +extent[0][1] + (h - k * (y1 + y0)) / 2;
        return albersUsaPr.scale(k * 150).translate([tx, ty]);
    };

    albersUsaPr.fitSize = function(size, object) {
        return albersUsaPr.fitExtent([[0, 0], size], object);
    };

    // Initialise at default scale with a placeholder translate so pointStreams are created
    return albersUsaPr.scale(1070).translate([480, 300]);
}

// ==================== FLAT WORLD (wrapping Mercator) ====================
// The flat view of the world crops to a band that barely contains Greenland to
// the north and the southern tip of Chile to the south, fills the container, and
// wraps continuously east-west (horizontal panning rotates the projection's
// longitude rather than translating, so countries re-enter on the far edge).
const FLAT_WORLD_NORTH = 84;
const FLAT_WORLD_SOUTH = -56;

function mercatorY(latDeg) {
    return Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI / 180) / 2));
}

// True when showing the wrapping flat world (a globe mode, in map view, world geometry).
function isFlatWorldView() {
    const mc = QUIZ_MODES[gameState.mode];
    return !!(mc && mc.useGlobe && flatGlobeView && mc.mapObject === 'countries');
}

// Scale that fills the container for the crop band (also the zoom-out floor).
function flatWorldFitScale() {
    const band = mercatorY(FLAT_WORLD_NORTH) - mercatorY(FLAT_WORLD_SOUTH);
    return Math.max(width / (2 * Math.PI), height / band);
}

// Keep the crop band covering the viewport vertically (no blank above/below).
function clampFlatWorldVertical() {
    const s = projection.scale();
    const t = projection.translate();
    const a = s * mercatorY(FLAT_WORLD_NORTH);          // translate[1] that puts North at y=0
    const b = height + s * mercatorY(FLAT_WORLD_SOUTH); // translate[1] that puts South at y=height
    const ty = Math.max(Math.min(a, b), Math.min(Math.max(a, b), t[1]));
    if (ty !== t[1]) projection.translate([t[0], ty]);
}

// Fit the whole world into the container width (all longitudes visible) for the
// Find-the-Capital guessing map — a static, non-wrapping Mercator.
function fitCapitalWorld(proj) {
    const yMid = (mercatorY(FLAT_WORLD_NORTH) + mercatorY(FLAT_WORLD_SOUTH)) / 2;
    const scale = width / (2 * Math.PI);
    proj.center([0, 0]);
    proj.rotate([0, 0, 0]);
    proj.scale(scale);
    proj.translate([width / 2, height / 2 + scale * yMid]);
}

// Configure the projection to fill the container for the crop band, centered.
function fitFlatWorld(proj) {
    const yMid = (mercatorY(FLAT_WORLD_NORTH) + mercatorY(FLAT_WORLD_SOUTH)) / 2;
    const scale = flatWorldFitScale();
    proj.center([0, 0]);
    proj.rotate([0, 0, 0]);
    proj.scale(scale);
    proj.translate([width / 2, height / 2 + scale * yMid]);
}

// Set up the globe SVG and projection
function setupGlobe() {
    const modeConfig = QUIZ_MODES[gameState.mode];

    // Leaving the orbital ("spaceship") view: tear down its WebGL canvas/context.
    if (!modeConfig.spaceshipMode) disposeOrbital();

    // Select the appropriate SVG element based on layout
    const svgId = modeConfig.useWorldQuizLayout ? '#globe-world' : '#globe';

    // Clear any existing content in the SVG
    d3.select(svgId).selectAll('*').remove();

    svg = d3.select(svgId)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('width', '100%')
        .style('height', '100%')
        .style('display', '')          // undo any prior spaceship-mode hide
        .style('touch-action', 'none');

    const globeView = modeConfig.useGlobe && !flatGlobeView;
    const spaceship = modeConfig.spaceshipMode;
    svg.classed('spaceship-view', !!spaceship);

    if (spaceship) {
        // The orbital view is drawn by three.js on its own WebGL canvas. This
        // projection is only scaffolding so the shared globe setup below (and the
        // now-hidden SVG) has a valid projection to path against.
        projection = d3.geoOrthographic()
            .translate([width / 2, height / 2])
            .clipAngle(90);
    } else if (globeView) {
        // Orthographic projection for globe view
        projection = d3.geoOrthographic()
            .scale(Math.min(width, height) / 2 - 10)
            .translate([width / 2, height / 2])
            .clipAngle(90);
    } else if (modeConfig.useAlbersUsa) {
        // Albers USA composite projection — AK and HI insets are built in
        projection = d3.geoAlbersUsa();
    } else {
        // Mercator projection for regional maps (India, Germany, etc.) and the flat world view.
        // precision(0) disables D3's adaptive great-circle resampling, which would otherwise
        // bow straight parallels (e.g. the 49th-parallel US–Canada border) into visible curves.
        projection = d3.geoMercator()
            .center([0, 0])
            .scale(1)
            .translate([width / 2, height / 2])
            .precision(0);
    }

    path = d3.geoPath().projection(projection);

    // Add gradient for ocean
    // Pull the muted ocean tones from the active theme's CSS variables
    const rootStyle = getComputedStyle(document.documentElement);
    const ocean1 = (rootStyle.getPropertyValue('--ocean-1').trim()) || '#aebfca';
    const ocean2 = (rootStyle.getPropertyValue('--ocean-2').trim()) || '#647d8d';

    const defs = svg.append('defs');
    // userSpaceOnUse so the ocean circle/sphere AND carved-out lakes all sample the
    // same globe-centered gradient (kept in sync by syncOceanGradient on every redraw).
    const gradient = defs.append('radialGradient')
        .attr('id', 'ocean-gradient')
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('cx', width / 2).attr('cy', height / 2).attr('r', projection.scale() || Math.min(width, height) / 2);

    gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', ocean1);

    gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', ocean2);

    // Create main group
    g = svg.append('g');

    if (spaceship) {
        // The photographic orbital view renders on a three.js WebGL canvas overlaid on
        // the map container (created lazily in ensureOrbital); hide the SVG globe.
        svg.style('display', 'none');
    } else if (globeView) {
        // Draw ocean for globe view
        g.append('circle')
            .attr('cx', width / 2)
            .attr('cy', height / 2)
            .attr('r', projection.scale())
            .attr('fill', 'url(#ocean-gradient)')
            .attr('stroke', ocean2)
            .attr('stroke-width', 1.5);
    }

    // Group for countries
    countriesGroup = g.append('g');

    // Add drag behavior: quaternion rotation for the globe, simple panning for flat maps
    // (the orbital view has its own pointer handlers on the WebGL canvas).
    if (globeView && !spaceship) {
        const drag = d3.drag()
            .on('start', dragStart)
            .on('drag', dragging)
            .on('end', dragEnd);

        svg.call(drag);
    } else if (modeConfig.useGlobe) {
        // Flat (Mercator) view of a globe mode: drag to pan
        let panLast = null;
        const flatDrag = d3.drag()
            .on('start', (event) => { panLast = [event.x, event.y]; })
            .on('drag', (event) => {
                if (gameState.scrollLocked || !panLast) return;
                const dx = event.x - panLast[0];
                const dy = event.y - panLast[1];
                if (isFlatWorldView()) {
                    // Horizontal pan rotates the projection's longitude → seamless wrap.
                    const dLon = dx * 360 / (2 * Math.PI * projection.scale());
                    const r = projection.rotate();
                    projection.rotate([r[0] + dLon, r[1], r[2]]);
                    const t = projection.translate();
                    projection.translate([t[0], t[1] + dy]);
                    clampFlatWorldVertical();
                } else {
                    const t = projection.translate();
                    projection.translate([t[0] + dx, t[1] + dy]);
                }
                panLast = [event.x, event.y];
                countriesGroup.selectAll('path').attr('d', path);
                updateIslandMarkers();
            });
        svg.call(flatDrag);
    }

    // Find-the-Capital: clicking the map drops/moves a guess marker.
    if (modeConfig.findCapitalMode) {
        svg.on('click', handleCapitalGuessClick);
    }

    // Add zoom behavior with scroll wheel (Jason Davies style)
    svg.on('wheel', function(event) {
        // Don't allow scrolling if locked
        if (gameState.scrollLocked) {
            event.preventDefault();
            return;
        }

        event.preventDefault();

        // The Find-the-Capital map is static so guess markers stay aligned.
        if (QUIZ_MODES[gameState.mode] && QUIZ_MODES[gameState.mode].findCapitalMode) return;

        const delta = -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002);
        const scale = projection.scale();
        const k = Math.pow(2, delta);
        const newScale = scale * k;

        // Set min and max scale limits (don't zoom out beyond starting view)
        const minScale = gameState.initialScale || 100;
        const maxScale = 2000;

        if (newScale >= minScale && newScale <= maxScale) {
            const modeConfig = QUIZ_MODES[gameState.mode];

            if (isFlatWorldView()) {
                // Flat world: zoom about the cursor — longitude via rotation
                // (keeps the wrap), latitude via translate.
                const mouse = d3.pointer(event, svg.node());
                const geo = projection.invert(mouse);
                projection.scale(newScale);
                if (geo) {
                    const after = projection(geo);
                    if (after) {
                        const dLon = (mouse[0] - after[0]) * 360 / (2 * Math.PI * newScale);
                        const r = projection.rotate();
                        projection.rotate([r[0] + dLon, r[1], r[2]]);
                        const after2 = projection(geo);
                        if (after2) {
                            const t = projection.translate();
                            projection.translate([t[0], t[1] + (mouse[1] - after2[1])]);
                        }
                    }
                }
                clampFlatWorldVertical();
            } else if (isGlobeView()) {
                // Globe mode: zoom towards mouse position using rotation
                const mouse = d3.pointer(event, svg.node());
                const mouseGeo = projection.invert(mouse);

                projection.scale(newScale);

                // Adjust rotation to zoom towards mouse position
                if (mouseGeo && !isNaN(mouseGeo[0]) && !isNaN(mouseGeo[1])) {
                    const mousePx = projection(mouseGeo);
                    if (mousePx) {
                        const dx = mousePx[0] - mouse[0];
                        const dy = mousePx[1] - mouse[1];
                        const rotation = projection.rotate();
                        const k = 75 / scale;
                        projection.rotate([rotation[0] + dx * k, rotation[1] - dy * k, rotation[2]]);
                        r_unconstrained = projection.rotate().slice();
                    }
                }

                // Update ocean circle for globe view
                g.select('circle').attr('r', newScale);
            } else {
                // States mode: zoom centered on closest state to cursor
                const mouse = d3.pointer(event, svg.node());
                const mouseGeo = projection.invert(mouse);

                // Find the state under the cursor or closest to it
                let targetState = null;
                if (mouseGeo && !isNaN(mouseGeo[0]) && !isNaN(mouseGeo[1]) && gameState.countries) {
                    // First, try to find a state that contains the mouse point
                    for (const state of gameState.countries) {
                        if (d3.geoContains(state, mouseGeo)) {
                            targetState = state;
                            break;
                        }
                    }

                    // If no state contains the mouse (outside bounds), find the closest state
                    if (!targetState && gameState.countries.length > 0) {
                        let minDist = Infinity;
                        for (const state of gameState.countries) {
                            const centroid = d3.geoCentroid(state);
                            const dist = Math.sqrt(
                                Math.pow(centroid[0] - mouseGeo[0], 2) +
                                Math.pow(centroid[1] - mouseGeo[1], 2)
                            );
                            if (dist < minDist) {
                                minDist = dist;
                                targetState = state;
                            }
                        }
                    }
                }

                // Zoom centered on the target state's centroid
                if (targetState) {
                    const centroid = d3.geoCentroid(targetState);
                    const centroidPx = projection(centroid);

                    projection.scale(newScale);

                    // Adjust translate to keep centroid at the same screen position
                    const newCentroidPx = projection(centroid);
                    if (centroidPx && newCentroidPx) {
                        const translate = projection.translate();
                        projection.translate([
                            translate[0] + (centroidPx[0] - newCentroidPx[0]),
                            translate[1] + (centroidPx[1] - newCentroidPx[1])
                        ]);
                    }
                } else {
                    // Fallback: just scale without repositioning
                    projection.scale(newScale);
                }
            }

            countriesGroup.selectAll('path').attr('d', path);
            updateIslandMarkers();
        }
    });

    // Touch support: pinch-to-zoom and single-finger drag
    let touchState = { lastDist: null, lastCenter: null, dragging: false, moved: false, startPos: null, wasPinch: false };

    function touchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function svgPoint(touch) {
        const rect = svg.node().getBoundingClientRect();
        const scaleX = width / rect.width;
        const scaleY = height / rect.height;
        return [(touch.clientX - rect.left) * scaleX, (touch.clientY - rect.top) * scaleY];
    }

    svg.node().addEventListener('touchstart', function(e) {
        if (gameState.scrollLocked) return;
        if (e.touches.length === 2) {
            e.preventDefault();
            touchState.lastDist = touchDist(e.touches);
            touchState.dragging = false;
            touchState.wasPinch = true;
        } else if (e.touches.length === 1 && !touchState.wasPinch) {
            touchState.dragging = true;
            touchState.moved = false;
            touchState.lastCenter = null;
            touchState.startPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            const p = svgPoint(e.touches[0]);
            r0 = projection.rotate();
            v0 = versor.cartesian(projection.invert(p));
            q0 = versor(r_unconstrained || r0);
        }
    }, { passive: false });

    svg.node().addEventListener('touchmove', function(e) {
        if (gameState.scrollLocked) return;
        e.preventDefault();
        if (e.touches.length === 2) {
            // Pinch zoom
            const dist = touchDist(e.touches);
            if (touchState.lastDist) {
                const k = dist / touchState.lastDist;
                const scale = projection.scale();
                const newScale = scale * k;
                const minScale = gameState.initialScale || 100;
                const maxScale = 2000;
                if (newScale >= minScale && newScale <= maxScale) {
                    projection.scale(newScale);
                    if (isGlobeView()) {
                        g.select('circle').attr('r', newScale);
                    }
                    countriesGroup.selectAll('path').attr('d', path);
                    updateIslandMarkers();
                }
            }
            touchState.lastDist = dist;
        } else if (e.touches.length === 1 && touchState.dragging) {
            // Check if finger has moved enough to count as a drag (not a tap)
            if (touchState.startPos) {
                const dx = e.touches[0].clientX - touchState.startPos.x;
                const dy = e.touches[0].clientY - touchState.startPos.y;
                if (Math.sqrt(dx * dx + dy * dy) > 8) touchState.moved = true;
            }
            if (!touchState.moved) return;

            const p = svgPoint(e.touches[0]);
            if (isGlobeView()) {
                projection.rotate(r0);
                const v1 = versor.cartesian(projection.invert(p));
                const q1 = versor.multiply(q0, versor.delta(v0, v1));
                const r1 = versor.rotation(q1);
                if (gammaLocked) {
                    const constrainedLat = Math.max(-85, Math.min(85, r1[1]));
                    const locked = [r1[0], constrainedLat, 0];
                    projection.rotate(locked);
                    r_unconstrained = locked;
                } else {
                    projection.rotate(r1);
                    r_unconstrained = r1;
                }
            } else {
                // Flat map pan
                if (touchState.lastCenter) {
                    const pdx = p[0] - touchState.lastCenter[0];
                    const pdy = p[1] - touchState.lastCenter[1];
                    if (isFlatWorldView()) {
                        const dLon = pdx * 360 / (2 * Math.PI * projection.scale());
                        const r = projection.rotate();
                        projection.rotate([r[0] + dLon, r[1], r[2]]);
                        const t = projection.translate();
                        projection.translate([t[0], t[1] + pdy]);
                        clampFlatWorldVertical();
                    } else if (!(QUIZ_MODES[gameState.mode] && QUIZ_MODES[gameState.mode].findCapitalMode)) {
                        const t = projection.translate();
                        projection.translate([t[0] + pdx, t[1] + pdy]);
                    }
                }
            }
            touchState.lastCenter = p;
            countriesGroup.selectAll('path').attr('d', path);
            updateIslandMarkers();
        }
    }, { passive: false });

    svg.node().addEventListener('touchend', function(e) {
        if (e.touches.length < 2) touchState.lastDist = null;
        if (e.touches.length === 0) {
            // If it was a clean single-finger tap (no drag, no pinch), simulate a click
            if (!touchState.moved && !touchState.wasPinch && touchState.startPos) {
                const target = document.elementFromPoint(touchState.startPos.x, touchState.startPos.y);
                if (target) target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
            touchState.dragging = false;
            touchState.moved = false;
            touchState.wasPinch = false;
            touchState.lastCenter = null;
            touchState.startPos = null;
        }
    });
}

// Some hi-res world features render as the whole globe: either wound backwards
// (cleanly inverted → reverse the rings) or genuinely broken (e.g. Maldives in the
// 10m data, whose geoArea is nonsensically huge → drop it; it falls back to an
// island dot). A real country never exceeds ~half a steradian, so anything over a
// hemisphere is bad geometry.
function reverseRings(g) {
    if (!g) return;
    if (g.type === 'Polygon') g.coordinates.forEach(r => r.reverse());
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => r.reverse()));
}

function fixCountryWinding(features) {
    for (let i = features.length - 1; i >= 0; i--) {
        const f = features[i];
        if (!f.geometry) continue;
        if (d3.geoArea(f) > 2 * Math.PI) {
            reverseRings(f.geometry);          // try to fix a clean inversion
            if (d3.geoArea(f) > 2 * Math.PI) {
                features.splice(i, 1);         // still broken → drop so it can't cover the map
            }
        }
    }
}

// Load map data based on current mode
function loadMapData() {
    const modeConfig = QUIZ_MODES[gameState.mode];

    // World modes pick their resolution from the detail toggle; others use their fixed URL.
    const mapUrl = (modeConfig.mapObject === 'countries') ? worldCountriesUrl() : modeConfig.mapUrl;
    const loader = (modeConfig.mapObject === 'countries') ? fetchWorldTopo(mapUrl) : d3.json(mapUrl);
    loader
        .then(data => {
            // Check mapObject to determine how to process the data
            if (modeConfig.mapObject === 'countries') {
                gameState.countries = worldFeaturesFromTopology(data);

                // Add country names. Some features (disputed territories) have no
                // numeric id; keep their original map name instead of a placeholder.
                gameState.countries.forEach(country => {
                    const mapped = getCountryName(country.id);
                    if (!/^Country /.test(mapped)) {
                        country.properties.name = mapped;
                    }
                });
                // Tag overseas territories with their sovereign parent so they fill
                // with (and count as) the parent, while staying separate features.
                tagTerritories(gameState.countries);
                fixCountryWinding(gameState.countries);

                // Flat (Mercator) view of the world: crop to the Greenland–Chile
                // band, fill the container, and enable east-west wrapping.
                // The orthographic globe keeps its fixed scale instead.
                if (modeConfig.findCapitalMode) {
                    fitCapitalWorld(projection); // static full-width world for guessing
                } else if (flatGlobeView) {
                    fitFlatWorld(projection);
                }
            } else if (modeConfig.mapObject === 'states') {
                gameState.countries = topojson.feature(data, data.objects.states).features;
                gameState.countries.forEach(state => {
                    state.properties.name = getStateName(state.id);
                });
                // geoAlbersUsa handles AK/HI insets; fitSize scales the whole composite
                projection.fitSize([width, height], {
                    type: 'FeatureCollection',
                    features: gameState.countries
                });
            } else if (modeConfig.mapObject === null) {
                // For maps with null mapObject (like Indian states), data is already in GeoJSON format
                if (data.features) {
                    gameState.countries = data.features;
                } else {
                    gameState.countries = data;
                }

                // Map state names from properties
                gameState.countries.forEach(state => {
                    if (state.properties.st_nm) {
                        state.properties.name = state.properties.st_nm;
                    } else if (state.properties.NAME_1) {
                        state.properties.name = state.properties.NAME_1;
                    } else if (state.properties.CTRY21NM) {
                        state.properties.name = state.properties.CTRY21NM;
                    }
                });

                // Fit projection to data
                projection.fitSize([width, height], {
                    type: 'FeatureCollection',
                    features: gameState.countries
                });
            }

            shapeDescriptorCache = null; // rebuild shape descriptors for the new geometry
            drawCountries();
            gameState.initialScale = projection.scale();
            startNewQuestion();
        })
        .catch(error => {
            console.error('Error loading map data:', error);
            document.getElementById('question-text').textContent = 'Error loading map data';
        });
}

// Reload the world geometry at the current detail level WITHOUT starting a new
// question — preserves rotation/scale and any in-progress highlight.
function reloadWorldDetail() {
    const modeConfig = QUIZ_MODES[gameState.mode];
    if (!countriesGroup || !modeConfig || modeConfig.mapObject !== 'countries') return;

    // Capture per-feature highlight classes so they can be restored after redraw.
    const highlights = [];
    countriesGroup.selectAll('path').each(function (d) {
        const cls = this.getAttribute('class') || '';
        if (cls !== 'country' && cls !== 'lake') {
            highlights.push({ name: d && d.properties && d.properties.name, cls });
        }
    });

    const rot = projection.rotate(), sc = projection.scale(), tr = projection.translate();
    fetchWorldTopo(worldCountriesUrl()).then(data => {
        gameState.countries = worldFeaturesFromTopology(data);
        gameState.countries.forEach(c => {
            const m = getCountryName(c.id);
            if (!/^Country /.test(m)) c.properties.name = m;
        });
        fixCountryWinding(gameState.countries);
        projection.rotate(rot).scale(sc).translate(tr);
        countriesGroup.selectAll('*').remove();
        drawCountries(); // redraws land + lakes + island dots
        highlights.forEach(h => {
            countriesGroup.selectAll('path')
                .filter(d => d && d.properties && d.properties.name === h.name)
                .attr('class', h.cls);
        });
        updateIslandMarkers();
    }).catch(err => console.error('Detail reload failed:', err));
}

// Load world map data (legacy function for backwards compatibility)
function loadWorldData() {
    loadMapData();
}

// ==================== OVERSEAS TERRITORIES ====================
// Overseas dependencies that appear as their OWN feature in the world-atlas but
// belong to a sovereign parent. Keyed by ISO 3166-1 numeric id (= the atlas
// feature id). Marking these lets us: (a) fill them green when the parent is
// named/clicked, (b) count a click on the territory as finding the parent, and
// (c) label/flag them by the parent — e.g. "Puerto Rico (USA)". Because they stay
// SEPARATE features with their own names, the parent's shape/centroid/bounding box
// (used for zoom and Shape-ID) naturally excludes them, as requested.
const TERRITORY_BY_ID = {
    // United Kingdom
    60:  { name: 'Bermuda',                     parent: 'United Kingdom' },
    92:  { name: 'British Virgin Islands',      parent: 'United Kingdom' },
    136: { name: 'Cayman Islands',              parent: 'United Kingdom' },
    238: { name: 'Falkland Islands',            parent: 'United Kingdom' },
    292: { name: 'Gibraltar',                   parent: 'United Kingdom' },
    500: { name: 'Montserrat',                  parent: 'United Kingdom' },
    654: { name: 'Saint Helena',                parent: 'United Kingdom' },
    660: { name: 'Anguilla',                    parent: 'United Kingdom' },
    796: { name: 'Turks and Caicos Islands',    parent: 'United Kingdom' },
    831: { name: 'Guernsey',                    parent: 'United Kingdom' },
    832: { name: 'Jersey',                      parent: 'United Kingdom' },
    833: { name: 'Isle of Man',                 parent: 'United Kingdom' },
    // United States
    16:  { name: 'American Samoa',              parent: 'United States of America' },
    316: { name: 'Guam',                        parent: 'United States of America' },
    580: { name: 'Northern Mariana Islands',    parent: 'United States of America' },
    630: { name: 'Puerto Rico',                 parent: 'United States of America' },
    850: { name: 'United States Virgin Islands', parent: 'United States of America' },
    // France
    258: { name: 'French Polynesia',            parent: 'France' },
    260: { name: 'French Southern Territories', parent: 'France' },
    540: { name: 'New Caledonia',               parent: 'France' },
    663: { name: 'Saint Martin',                parent: 'France' },
    666: { name: 'Saint Pierre and Miquelon',   parent: 'France' },
    876: { name: 'Wallis and Futuna',           parent: 'France' },
    // Denmark
    234: { name: 'Faroe Islands',               parent: 'Denmark' },
    304: { name: 'Greenland',                   parent: 'Denmark' },
    // Netherlands
    531: { name: 'Curaçao',                     parent: 'Netherlands' },
    533: { name: 'Aruba',                       parent: 'Netherlands' },
    534: { name: 'Sint Maarten',                parent: 'Netherlands' },
    // New Zealand
    184: { name: 'Cook Islands',                parent: 'New Zealand' },
    570: { name: 'Niue',                        parent: 'New Zealand' },
    // Australia
    162: { name: 'Christmas Island',            parent: 'Australia' },
    166: { name: 'Cocos Islands',               parent: 'Australia' },
    574: { name: 'Norfolk Island',              parent: 'Australia' },
};

// Short parenthetical shown after a territory's name, e.g. "Puerto Rico (USA)".
const PARENT_ABBREV = {
    'United States of America': 'USA',
    'United Kingdom': 'UK',
    'New Zealand': 'NZ',
};

// Reverse map (territory name -> parent name), built once from TERRITORY_BY_ID.
const TERRITORY_PARENT_BY_NAME = {};
Object.values(TERRITORY_BY_ID).forEach(t => { TERRITORY_PARENT_BY_NAME[t.name] = t.parent; });

// Parent country name for a territory, or null if `name` isn't a territory.
function parentOfTerritory(name) {
    return TERRITORY_PARENT_BY_NAME[name] || null;
}

// The name to use for data lookups (flag / capital / population): a territory
// resolves to its sovereign parent, everything else is itself.
function effectiveDataName(name) {
    return parentOfTerritory(name) || name;
}

// Display label for a feature/name — "Puerto Rico (USA)" for territories.
function displayLabelForName(name) {
    const parent = parentOfTerritory(name);
    if (!parent) return name;
    return `${name} (${PARENT_ABBREV[parent] || parent})`;
}

// Attach territory metadata (parent, isTerritory, displayName) to world features.
function tagTerritories(features) {
    features.forEach(f => {
        const terr = TERRITORY_BY_ID[parseInt(f.id, 10)];
        if (!terr) return;
        f.properties.name = terr.name;
        f.properties.parent = terr.parent;
        f.properties.isTerritory = true;
        f.properties.displayName = displayLabelForName(terr.name);
    });
}

// Map country IDs to names (simplified version)
function getCountryName(id) {
    const countryNames = {
        4: 'Afghanistan', 8: 'Albania', 12: 'Algeria', 20: 'Andorra', 24: 'Angola',
        28: 'Antigua and Barbuda', 31: 'Azerbaijan', 32: 'Argentina', 36: 'Australia',
        40: 'Austria', 44: 'Bahamas', 48: 'Bahrain', 50: 'Bangladesh', 51: 'Armenia',
        52: 'Barbados', 56: 'Belgium', 60: 'Bermuda', 64: 'Bhutan', 68: 'Bolivia',
        70: 'Bosnia and Herzegovina', 72: 'Botswana', 76: 'Brazil', 84: 'Belize',
        90: 'Solomon Islands', 96: 'Brunei', 100: 'Bulgaria', 104: 'Myanmar',
        108: 'Burundi', 112: 'Belarus', 116: 'Cambodia', 120: 'Cameroon', 124: 'Canada',
        132: 'Cape Verde', 140: 'Central African Republic', 144: 'Sri Lanka', 148: 'Chad',
        152: 'Chile', 156: 'China', 170: 'Colombia', 174: 'Comoros', 178: 'Republic of the Congo',
        180: 'Democratic Republic of the Congo', 188: 'Costa Rica', 191: 'Croatia',
        192: 'Cuba', 196: 'Cyprus', 203: 'Czechia', 204: 'Benin', 208: 'Denmark',
        212: 'Dominica', 214: 'Dominican Republic', 218: 'Ecuador', 222: 'El Salvador',
        226: 'Equatorial Guinea', 231: 'Ethiopia', 232: 'Eritrea', 233: 'Estonia',
        242: 'Fiji', 246: 'Finland', 250: 'France', 260: 'French Southern Territories',
        262: 'Djibouti', 266: 'Gabon', 268: 'Georgia', 270: 'Gambia', 275: 'Palestine',
        276: 'Germany', 288: 'Ghana', 296: 'Kiribati', 300: 'Greece', 308: 'Grenada',
        320: 'Guatemala', 324: 'Guinea', 328: 'Guyana', 332: 'Haiti', 336: 'Vatican City',
        340: 'Honduras', 348: 'Hungary', 352: 'Iceland', 356: 'India', 360: 'Indonesia',
        364: 'Iran', 368: 'Iraq', 372: 'Ireland', 376: 'Israel', 380: 'Italy',
        384: 'Ivory Coast', 388: 'Jamaica', 392: 'Japan', 398: 'Kazakhstan', 400: 'Jordan',
        404: 'Kenya', 408: 'North Korea', 410: 'South Korea', 414: 'Kuwait', 417: 'Kyrgyzstan',
        418: 'Laos', 422: 'Lebanon', 426: 'Lesotho', 428: 'Latvia', 430: 'Liberia',
        434: 'Libya', 438: 'Liechtenstein', 440: 'Lithuania', 442: 'Luxembourg',
        450: 'Madagascar', 454: 'Malawi', 458: 'Malaysia', 462: 'Maldives', 466: 'Mali',
        470: 'Malta', 478: 'Mauritania', 480: 'Mauritius', 484: 'Mexico', 492: 'Monaco',
        496: 'Mongolia', 498: 'Moldova', 499: 'Montenegro', 504: 'Morocco', 508: 'Mozambique',
        512: 'Oman', 516: 'Namibia', 520: 'Nauru', 524: 'Nepal', 528: 'Netherlands',
        554: 'New Zealand', 558: 'Nicaragua', 562: 'Niger', 566: 'Nigeria', 578: 'Norway',
        583: 'Micronesia', 586: 'Pakistan', 591: 'Panama', 598: 'Papua New Guinea',
        600: 'Paraguay', 604: 'Peru', 608: 'Philippines', 616: 'Poland', 620: 'Portugal',
        624: 'Guinea-Bissau', 626: 'East Timor', 630: 'Puerto Rico', 634: 'Qatar',
        642: 'Romania', 643: 'Russia', 646: 'Rwanda',
        659: 'Saint Kitts and Nevis', 662: 'Saint Lucia', 670: 'Saint Vincent and the Grenadines',
        682: 'Saudi Arabia', 686: 'Senegal',
        688: 'Serbia', 690: 'Seychelles', 694: 'Sierra Leone', 702: 'Singapore',
        703: 'Slovakia', 704: 'Vietnam', 705: 'Slovenia', 706: 'Somalia', 710: 'South Africa',
        716: 'Zimbabwe', 724: 'Spain', 728: 'South Sudan', 729: 'Sudan', 732: 'Western Sahara',
        740: 'Suriname', 748: 'Eswatini', 752: 'Sweden', 756: 'Switzerland', 760: 'Syria',
        762: 'Tajikistan', 764: 'Thailand', 768: 'Togo', 776: 'Tonga', 780: 'Trinidad and Tobago',
        784: 'United Arab Emirates', 788: 'Tunisia', 792: 'Turkey', 795: 'Turkmenistan',
        800: 'Uganda', 804: 'Ukraine', 807: 'North Macedonia', 818: 'Egypt', 826: 'United Kingdom',
        831: 'Guernsey', 832: 'Jersey', 834: 'Tanzania', 840: 'United States of America',
        854: 'Burkina Faso', 858: 'Uruguay', 860: 'Uzbekistan', 862: 'Venezuela',
        876: 'Wallis and Futuna', 882: 'Samoa', 887: 'Yemen', 894: 'Zambia',
        // Additional territories / entities present in the world-atlas map
        158: 'Taiwan', 238: 'Falkland Islands', 304: 'Greenland',
        540: 'New Caledonia', 548: 'Vanuatu'
    };

    // Map feature ids are zero-padded strings (e.g. "004", "032"); normalize to int.
    return countryNames[parseInt(id, 10)] || `Country ${id}`;
}

// Map US state IDs to names
function getStateName(id) {
    const stateNames = {
        1: 'Alabama', 2: 'Alaska', 4: 'Arizona', 5: 'Arkansas', 6: 'California',
        8: 'Colorado', 9: 'Connecticut', 10: 'Delaware', 12: 'Florida', 13: 'Georgia',
        15: 'Hawaii', 16: 'Idaho', 17: 'Illinois', 18: 'Indiana', 19: 'Iowa',
        20: 'Kansas', 21: 'Kentucky', 22: 'Louisiana', 23: 'Maine', 24: 'Maryland',
        25: 'Massachusetts', 26: 'Michigan', 27: 'Minnesota', 28: 'Mississippi', 29: 'Missouri',
        30: 'Montana', 31: 'Nebraska', 32: 'Nevada', 33: 'New Hampshire', 34: 'New Jersey',
        35: 'New Mexico', 36: 'New York', 37: 'North Carolina', 38: 'North Dakota', 39: 'Ohio',
        40: 'Oklahoma', 41: 'Oregon', 42: 'Pennsylvania', 44: 'Rhode Island', 45: 'South Carolina',
        46: 'South Dakota', 47: 'Tennessee', 48: 'Texas', 49: 'Utah', 50: 'Vermont',
        51: 'Virginia', 53: 'Washington', 54: 'West Virginia', 55: 'Wisconsin', 56: 'Wyoming',
        72: 'Puerto Rico'
    };

    return stateNames[id] || `State ${id}`;
}

// Country dots: a feature whose largest polygon is too small to see on screen (and
// any world micro-state with no polygon at all) is drawn as a clickable circle
// instead of an invisible sliver. Dot-vs-outline is decided per redraw from the
// on-screen pixel size, so it updates live as you zoom.
let islandMarkersGroup = null;
const ISLAND_MARKER_RADIUS = 4;
let DOT_PIXEL_THRESHOLD = 5;       // largest-polygon pixel size below which a dot is shown (slider-tunable)
const DOT_CANDIDATE_AREA = 0.05;   // steradians; bigger features are always outlines (skip the pixel check)
let DOT_SPACING = 5;               // min centre-to-centre px between dots; closer ones are nudged apart (slider-tunable)
const MIN_LAKE_DIAM_KM = 32;       // lakes whose largest inscribed circle is narrower than this (km) are hidden; ~just under Great Salt Lake. Locked.
// The Lake Winnipeg system is several separate Natural Earth features; treat them as
// one for the size filter so they appear/disappear together instead of fragmenting.
const WINNIPEG_GROUP = new Set(['Lake Winnipeg', 'Cedar Lake', 'Lake Manitoba', 'Lake Winnipegosis']);
let lakesGroup = null;     // major-lakes overlay (Great Lakes, Victoria, Baikal, …)
// Natural Earth lakes at two resolutions so the overlay tracks the map's detail level:
// 110m is bundled locally; 50m is fetched from jsdelivr and cached, with the local 110m
// file as a fallback. Keyed by resolution → features array.
const lakesCache = {};

// medium maps to 110m, NOT 50m: country coastlines at 'medium' are the 50m source
// client-side-simplified down to MEDIUM_SIMPLIFY_RETAIN (20%) via worldFeaturesFromTopology,
// but lake polygons have no equivalent simplification pass — fetching raw 50m lakes for
// 'medium' rendered them sharper than the coastline they sit inside. 110m lakes are close
// in coarseness to a 20%-simplified 50m coastline, and (being the bundled local file) need
// no network fetch, so 'medium' now locks to the same source as 'low'.
function lakesResForDetail() {
    const mc = QUIZ_MODES[gameState.mode];
    if (mc && mc.spaceshipMode) return '110m';                 // moot — lakes are suppressed in the orbital view
    return ({ low: '110m', medium: '110m', high: '50m' })[mapDetail] || '110m';
}
function lakesUrlForRes(res) {
    return res === '110m'
        ? 'data/lakes.geo.json'
        : `https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/${res}/physical/ne_${res}_lakes.json`;
}

// Draw countries on the globe
function drawCountries() {
    const mc = QUIZ_MODES[gameState.mode];
    // Country Shape ID draws only the current target (in renderCountryShapeIdQuestion);
    // adding the whole 10m world here would be far too heavy for a one-country view.
    if (!(mc && mc.countryShapeIdMode)) {
        countriesGroup.selectAll('path')
            .data(gameState.countries)
            .enter()
            .append('path')
            .attr('class', 'country')
            .attr('d', path)
            .on('click', handleCountryClick);
    }

    drawLakes();          // water on top of land, below the clickable dots
    drawIslandMarkers();

    // Re-apply the debug validity overlay if it is currently on
    if (debugValidityOn) applyDebugValidity();
}

// ---- Largest-inscribed-circle ("fatness") metric for lakes ----
// Even-odd point-in-polygon test against a set of rings ([[x,y],...] each).
function pointInPolygon(x, y, rings) {
    let inside = false;
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
        }
    }
    return inside;
}

function pointToSegmentDist(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let t = 0;
    const len2 = dx * dx + dy * dy;
    if (len2 > 0) t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function distToRings(x, y, rings) {
    let m = Infinity;
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            m = Math.min(m, pointToSegmentDist(x, y, ring[j], ring[i]));
        }
    }
    return m;
}

// Compact polylabel: coarse bbox grid → best interior cell → one local refine pass.
function largestInscribedRadius(rings) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const r of rings) for (const p of r) {
        if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
        if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
    }
    const search = (x0, y0, x1, y1, steps) => {
        let best = 0, bx = (x0 + x1) / 2, by = (y0 + y1) / 2;
        for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) {
            const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * j / steps;
            if (!pointInPolygon(x, y, rings)) continue;
            const d = distToRings(x, y, rings);
            if (d > best) { best = d; bx = x; by = y; }
        }
        return { best, bx, by };
    };
    const coarse = search(minx, miny, maxx, maxy, 40);
    const cw = (maxx - minx) / 40, ch = (maxy - miny) / 40;
    const fine = search(coarse.bx - cw, coarse.by - ch, coarse.bx + cw, coarse.by + ch, 20);
    return Math.max(coarse.best, fine.best);
}

// Diameter (km) of the largest circle that fits inside a lake feature's polygon.
// Cached on the feature object — drawLakes runs on every redraw, and at 50m there
// are many lakes, so this must not recompute per-redraw.
function lakeInscribedDiamKm(f) {
    if (f._lakeDiamKm != null) return f._lakeDiamKm;
    const geom = f.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    const [[w, s], [e, n]] = d3.geoBounds(f);
    const lat0 = (s + n) / 2;
    const kx = 111.320 * Math.cos(lat0 * Math.PI / 180), ky = 110.574; // deg → km at this latitude
    let best = 0;
    for (const poly of polys) {
        const rings = poly.map(r => r.map(p => [p[0] * kx, p[1] * ky]));
        best = Math.max(best, largestInscribedRadius(rings));
    }
    return (f._lakeDiamKm = 2 * best);
}

// Draw the major-lakes overlay (water-colored, non-interactive) on world maps,
// at the resolution matching the current map detail level.
function drawLakes() {
    if (lakesGroup) { lakesGroup.remove(); lakesGroup = null; }
    const lakesMode = QUIZ_MODES[gameState.mode];
    if (!g || !lakesMode || lakesMode.mapObject !== 'countries' || lakesMode.countryShapeIdMode) return;
    if (lakesMode.spaceshipMode) return; // lakes project to infinity under the tilt camera

    const res = lakesResForDetail();
    const feats = lakesCache[res];
    if (feats === undefined) {
        lakesCache[res] = null; // mark in-flight to avoid duplicate fetches
        d3.json(lakesUrlForRes(res))
            .then(data => { lakesCache[res] = (data && data.features) || []; drawLakes(); updateIslandMarkers(); })
            .catch(() => {
                // Fall back to the bundled 110m file so lakes still render.
                d3.json('data/lakes.geo.json')
                    .then(d => { lakesCache[res] = (d && d.features) || []; drawLakes(); updateIslandMarkers(); })
                    .catch(() => { lakesCache[res] = []; });
            });
        return;
    }
    if (feats === null) return; // still loading this resolution

    // Filter by the diameter of the largest circle that fits inside each lake (its
    // "fatness"), so long-thin lakes read as small. The Winnipeg system shares one
    // metric (its largest member) so its parts pass/fail together.
    const nameOf = f => f && f.properties && f.properties.name;
    const groupDiam = feats
        .filter(f => WINNIPEG_GROUP.has(nameOf(f)))
        .reduce((m, f) => Math.max(m, lakeInscribedDiamKm(f)), 0);
    const visibleFeats = feats.filter(f => {
        const d = WINNIPEG_GROUP.has(nameOf(f)) ? groupDiam : lakeInscribedDiamKm(f);
        return d >= MIN_LAKE_DIAM_KM;
    });

    // Match the surrounding ocean: the shaded gradient on the globe/orbit views,
    // the flat-map surface colour on Mercator (where the card backdrop is the ocean).
    const oceanFill = isGlobeView() ? 'url(#ocean-gradient)' : 'var(--surface)';
    lakesGroup = g.append('g').attr('class', 'lakes');
    lakesGroup.selectAll('path')
        .data(visibleFeats)
        .enter()
        .append('path')
        .attr('class', 'lake')
        .attr('d', path)
        .style('fill', oceanFill);
}

// Split a Polygon/MultiPolygon feature's geometry into one ring-set per polygon PART. A
// feature with several islands scattered across many degrees has one combined bounding box
// spanning the whole spread — measuring THAT (rather than each part on its own) is what let
// a 10-island nation register as "big" even when no single island is more than a pixel.
function featureParts(feature) {
    const geom = feature && feature.geometry;
    if (!geom) return [];
    if (geom.type === 'Polygon') return [geom.coordinates];
    if (geom.type === 'MultiPolygon') return geom.coordinates;
    return [];
}

// Longitude span of a set of degrees, correctly handling antimeridian wraparound: the true
// extent going around the circle is 360° minus the single largest gap between consecutive
// (sorted) longitudes. d3.geoBounds gets this right when it has a whole feature's worth of
// points to find the gap in, but on an ISOLATED ring of just a few points that happens to
// sit right at ±180° (e.g. a sliver of Fiji), it can't tell which side is "outside" and
// reports the full 360° — this computes it directly from the ring's own points instead.
function lonSpanDeg(lons) {
    if (lons.length < 2) return 0;
    const sorted = lons.slice().sort((a, b) => a - b);
    let maxGap = 360 - (sorted[sorted.length - 1] - sorted[0]); // wrap-around gap: last → first
    for (let i = 1; i < sorted.length; i++) maxGap = Math.max(maxGap, sorted[i] - sorted[i - 1]);
    return 360 - maxGap;
}

// A feature's largest angular extent among its individual polygon PARTS, in radians
// (rotation-independent) — not the combined bounding box of every part. Multiplying by the
// orthographic scale gives the pixel size the LARGEST part would have at the centre of the
// globe — so the dot/outline decision doesn't change as a country rotates toward the limb
// (where perspective foreshortening would otherwise shrink it into a dot).
function angularDimOfBounds(b) {
    let dLon = b[1][0] - b[0][0];
    if (dLon < 0) dLon += 360; // antimeridian-wrap safety (rare for dot candidates)
    const dLat = b[1][1] - b[0][1];
    const midLat = (b[0][1] + b[1][1]) / 2 * Math.PI / 180;
    const angW = dLon * Math.PI / 180 * Math.cos(midLat); // shrink longitude span toward the poles
    const angH = dLat * Math.PI / 180;
    const m = Math.max(Math.abs(angW), Math.abs(angH));
    return isFinite(m) ? m : 0;
}
// Per-part angular extent computed directly from the part's own raw points (via lonSpanDeg)
// rather than through d3.geoBounds, since a single small part is exactly the case where
// d3.geoBounds's antimeridian heuristic can misfire (see lonSpanDeg).
function angularDimOfPart(coords) {
    let minLat = Infinity, maxLat = -Infinity;
    const lons = [];
    coords.forEach(ring => ring.forEach(p => {
        lons.push(p[0]);
        if (p[1] < minLat) minLat = p[1];
        if (p[1] > maxLat) maxLat = p[1];
    }));
    if (!lons.length) return 0;
    const dLon = lonSpanDeg(lons);
    const dLat = maxLat - minLat;
    const midLat = (minLat + maxLat) / 2 * Math.PI / 180;
    const angW = dLon * Math.PI / 180 * Math.cos(midLat);
    const angH = dLat * Math.PI / 180;
    const m = Math.max(Math.abs(angW), Math.abs(angH));
    return isFinite(m) ? m : 0;
}
function featureAngularDim(f) {
    const parts = featureParts(f);
    if (!parts.length) return angularDimOfBounds(d3.geoBounds(f)); // unexpected geometry type: fall back whole
    let maxDim = 0;
    for (const coords of parts) {
        maxDim = Math.max(maxDim, angularDimOfPart(coords));
    }
    return maxDim;
}

// The flat-map analogue of featureAngularDim: largest on-screen pixel dimension among a
// feature's individual polygon parts, under the CURRENT projection — not path.bounds() on
// the whole feature, which unions every part into one bbox.
function pixelDimOfBounds(b) {
    if (!isFinite(b[0][0]) || !isFinite(b[0][1]) || !isFinite(b[1][0]) || !isFinite(b[1][1])) return 0;
    return Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]);
}
function featureMaxPartPixelDim(feature) {
    const parts = featureParts(feature);
    if (!parts.length) return pixelDimOfBounds(path.bounds(feature)); // unexpected geometry type: fall back whole
    let maxDim = 0;
    for (const coords of parts) {
        maxDim = Math.max(maxDim, pixelDimOfBounds(path.bounds({ type: 'Polygon', coordinates: coords })));
    }
    return maxDim;
}

// Build the candidate dot set: quiz items with no polygon (world micro-states) or a
// small enough polygon that they might need a dot at some zoom. Each dot carries its
// feature (for the live pixel-size check) and a [lon,lat] anchor.
function drawIslandMarkers() {
    if (islandMarkersGroup) { islandMarkersGroup.remove(); islandMarkersGroup = null; }

    const mc = QUIZ_MODES[gameState.mode];
    if (!g || !mc || mc.spaceshipMode || mc.countryShapeIdMode) return; // no dots in spaceship / shape silhouette

    const dataObj = gameState.currentDataObj || {};
    const quizList = gameState.currentQuizList || [];
    const featureByName = new Map();
    // Some atlas resolutions split a country into several features sharing a name
    // (e.g. a real Australia MultiPolygon plus a stray micro-polygon). Keep the
    // LARGEST one so the dot/outline decision uses the country's true size.
    (gameState.countries || []).forEach(f => {
        const n = f && f.properties && f.properties.name;
        if (!n) return;
        const prev = featureByName.get(n);
        if (!prev || d3.geoArea(f) > d3.geoArea(prev)) featureByName.set(n, f);
    });

    const dots = [];
    for (const name of quizList) {
        const f = featureByName.get(name);
        if (f) {
            if (d3.geoArea(f) > DOT_CANDIDATE_AREA) continue; // big feature: always an outline
            dots.push({ properties: { name }, feature: f, lonlat: d3.geoCentroid(f), angDim: featureAngularDim(f) });
        } else {
            const d = dataObj[name];
            if (d && Array.isArray(d.capitalCoords)) {
                dots.push({ properties: { name }, feature: null, lonlat: [d.capitalCoords[1], d.capitalCoords[0]] });
            }
        }
    }
    if (!dots.length) return;

    // Draw on top of the country paths so the dots stay clickable.
    islandMarkersGroup = g.append('g').attr('class', 'island-markers');
    islandMarkersGroup.selectAll('circle')
        .data(dots)
        .enter()
        .append('circle')
        .attr('class', 'country island-marker')
        .attr('r', ISLAND_MARKER_RADIUS)
        .on('click', handleCountryClick);

    updateIslandMarkers();
}

// Keep the ocean gradient centered/sized on the globe so the ocean and the carved
// lakes share identical shading at any zoom.
function syncOceanGradient() {
    if (!svg) return;
    const grad = svg.select('#ocean-gradient');
    if (grad.empty() || !isGlobeView()) return;
    grad.attr('cx', width / 2).attr('cy', height / 2).attr('r', projection.scale());
}

// Per redraw: keep the ocean gradient + lakes in sync, then decide for each
// candidate whether to show a dot or its polygon outline based on pixel size,
// hiding the polygon underneath when a dot is shown.
function updateIslandMarkers() {
    syncOceanGradient();
    if (lakesGroup) lakesGroup.selectAll('path').attr('d', path);
    if (!islandMarkersGroup) return;

    const globe = isGlobeView();
    // Only the orthographic globe has .rotate() and a far side to hide.
    const center = globe ? (() => { const r = projection.rotate(); return [-r[0], -r[1]]; })() : null;
    const dotted = new Set();
    const shown = [];      // visible dots, collected so overlapping ones can be spread apart
    const obstacles = [];  // small outline polygons a dot should not cover

    islandMarkersGroup.selectAll('circle').each(function (d) {
        const sel = d3.select(this);
        const xy = projection(d.lonlat);
        const offGlobe = globe && d3.geoDistance(d.lonlat, center) > Math.PI / 2;
        const valid = xy && !isNaN(xy[0]) && !offGlobe;
        let showDot = true;
        if (d.feature) {
            // On the globe, size the feature as if it were at the centre of view (angular
            // extent × scale) so it doesn't flip to a dot merely by rotating toward the
            // limb. Flat maps have no such foreshortening, so measure the on-screen bbox.
            // Both measure the LARGEST INDIVIDUAL polygon part, not every part combined.
            const maxDim = globe
                ? projection.scale() * (d.angDim || 0)
                : featureMaxPartPixelDim(d.feature);
            showDot = isFinite(maxDim) && maxDim < DOT_PIXEL_THRESHOLD;
        }
        if (!valid || !showDot) {
            sel.style('display', 'none');
            // A small feature shown as an outline (not a dot) is an obstacle the
            // surrounding dots should avoid covering.
            if (valid && !showDot && d.feature) obstacles.push({ x: xy[0], y: xy[1] });
        } else {
            sel.style('display', null);
            shown.push({ sel, x: xy[0], y: xy[1] });
            dotted.add(d.properties.name);
        }
    });

    // Nudge overlapping/too-close dots apart (and off small outline polygons) so each
    // stays individually visible — e.g. the dense Caribbean / Pacific clusters.
    relaxDots(shown, obstacles);
    shown.forEach(s => s.sel.attr('cx', s.x).attr('cy', s.y));

    // Hide the polygon outline for any country currently represented by a dot.
    countriesGroup.selectAll('path').each(function (d) {
        if (d && d.properties) this.style.display = dotted.has(d.properties.name) ? 'none' : null;
    });
}

// Simple iterative relaxation: push any pair of dots closer than DOT_SPACING apart
// (and push dots off fixed obstacle points the same distance). O(n²) but n is small.
function relaxDots(dots, obstacles) {
    const minD = DOT_SPACING;
    if (minD <= 0 || !dots.length) return;
    for (let iter = 0; iter < 12; iter++) {
        let moved = false;
        // Dot ↔ dot: split the overlap between the two.
        for (let i = 0; i < dots.length; i++) {
            for (let j = i + 1; j < dots.length; j++) {
                const a = dots[i], b = dots[j];
                let dx = b.x - a.x, dy = b.y - a.y;
                let dist = Math.hypot(dx, dy);
                if (dist >= minD) continue;
                if (dist < 1e-6) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = Math.hypot(dx, dy) || 1; }
                const push = (minD - dist) / 2;
                const ux = dx / dist, uy = dy / dist;
                a.x -= ux * push; a.y -= uy * push;
                b.x += ux * push; b.y += uy * push;
                moved = true;
            }
        }
        // Dot ↔ obstacle: only the dot moves (the polygon stays put).
        if (obstacles && obstacles.length) {
            for (const a of dots) {
                for (const o of obstacles) {
                    let dx = a.x - o.x, dy = a.y - o.y;
                    let dist = Math.hypot(dx, dy);
                    if (dist >= minD) continue;
                    if (dist < 1e-6) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = Math.hypot(dx, dy) || 1; }
                    const push = (minD - dist);
                    a.x += dx / dist * push; a.y += dy / dist * push;
                    moved = true;
                }
            }
        }
        if (!moved) break;
    }
}

// ==================== DEBUG: VALIDITY OVERLAY ====================
// Color-codes every map feature green (has matching quiz data) or red (no data),
// so it's easy to see which countries/states are actually playable.
let debugValidityOn = false;

function toggleDebugValidity() {
    // Only meaningful once a map is drawn
    if (typeof countriesGroup === 'undefined' || !countriesGroup) return;
    debugValidityOn = !debugValidityOn;
    applyDebugValidity();
    if (!debugValidityOn) clearDebugBoundingBoxes();
    const btn = document.getElementById('debug-validity-toggle');
    if (btn) btn.textContent = debugValidityOn ? 'Debug: On' : 'Debug: Off';
}

function applyDebugValidity() {
    if (!countriesGroup) return;
    const dataObj = gameState.currentDataObj || {};
    countriesGroup.selectAll('path').each(function (d) {
        const sel = d3.select(this);
        if (!debugValidityOn) {
            // Revert to stylesheet-driven colors
            sel.style('fill', null).style('stroke', null);
            return;
        }
        const name = d && d.properties && d.properties.name;
        const valid = name && Object.prototype.hasOwnProperty.call(dataObj, name);
        sel.style('fill', valid ? '#22c55e' : '#ef4444')
           .style('stroke', valid ? '#15803d' : '#991b1b');
    });
}

let debugBboxGroup = null;

function clearDebugBoundingBoxes() {
    if (debugBboxGroup) { debugBboxGroup.remove(); debugBboxGroup = null; }
}

// While the debug overlay is on, clicking/selecting a country draws its two pixel
// bounding boxes: the country's OWN feature (orange — what Shape-ID/zoom use, territories
// excluded) and the union INCLUDING its overseas territories (cyan). Static under the
// current projection (redraw by re-selecting); cleared on the next click / question.
function drawDebugBoundingBoxes(d) {
    clearDebugBoundingBoxes();
    if (!debugValidityOn || !g || !d || !d.properties) return;

    const name = d.properties.parent || d.properties.name;
    const members = (gameState.countries || []).filter(f => featureBelongsTo(f, name));
    const own = members.find(f => f.properties && f.properties.name === name && !f.properties.isTerritory)
        || (d.geometry ? d : (d.feature || null)); // fall back to the clicked feature itself

    debugBboxGroup = g.append('g').attr('class', 'debug-bbox-group').attr('pointer-events', 'none');

    const drawRect = (bounds, color, label) => {
        if (!bounds || !isFinite(bounds[0][0]) || !isFinite(bounds[1][0])) return;
        const x = bounds[0][0], y = bounds[0][1];
        const w = bounds[1][0] - bounds[0][0], h = bounds[1][1] - bounds[0][1];
        debugBboxGroup.append('rect')
            .attr('x', x).attr('y', y).attr('width', w).attr('height', h)
            .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '5,3');
        debugBboxGroup.append('text')
            .attr('x', x + 2).attr('y', Math.max(y - 3, 10))
            .attr('fill', color).attr('font-size', '11px').attr('font-family', 'monospace')
            .text(label);
    };

    // With territories: union of every member feature's pixel bbox.
    let ub = null;
    members.forEach(f => {
        const b = path.bounds(f);
        if (!isFinite(b[0][0])) return;
        if (!ub) ub = [[b[0][0], b[0][1]], [b[1][0], b[1][1]]];
        else {
            ub[0][0] = Math.min(ub[0][0], b[0][0]); ub[0][1] = Math.min(ub[0][1], b[0][1]);
            ub[1][0] = Math.max(ub[1][0], b[1][0]); ub[1][1] = Math.max(ub[1][1], b[1][1]);
        }
    });
    drawRect(ub, '#22d3ee', name + ' +territories');            // cyan, drawn first (underneath)
    if (own && own.geometry) drawRect(path.bounds(own), '#f97316', name); // orange, on top
}

// ==================== PROJECTION TOGGLE (Globe <-> Mercator) ====================

// Switch the current globe mode between the orthographic globe and a flat Mercator
// map, preserving the in-progress question.
function toggleFlatGlobe() {
    const mc = QUIZ_MODES[gameState.mode];
    if (!mc || !mc.useGlobe) return; // Only globe-capable modes can switch projection
    flatGlobeView = !flatGlobeView;
    reprojectMap();

    const btn = document.getElementById('projection-toggle');
    if (btn) btn.textContent = flatGlobeView ? 'View: Map' : 'View: Globe';
    const gammaToggle = document.getElementById('gamma-lock-toggle');
    if (gammaToggle) gammaToggle.style.display = isGlobeView() ? '' : 'none';
}

// Rebuild the map for the current projection without changing the question.
function reprojectMap() {
    if (!countriesGroup || !gameState.countries) return;

    // Capture current per-feature highlight state so it can be restored after redraw.
    const highlights = [];
    countriesGroup.selectAll('path').each(function (d) {
        const cls = this.getAttribute('class') || '';
        if (cls !== 'country') {
            highlights.push({
                name: d && d.properties && d.properties.name,
                cls: cls,
                fill: this.style.fill,
                stroke: this.style.stroke
            });
        }
    });

    stopGlobeSpin();
    setupGlobe();

    // Flat world view: crop/fill/wrap; the globe keeps its fixed scale.
    if (flatGlobeView && QUIZ_MODES[gameState.mode].mapObject === 'countries') {
        fitFlatWorld(projection);
    }

    drawCountries();
    gameState.initialScale = projection.scale();

    // Restore highlights (the debug overlay is re-applied by drawCountries).
    if (!debugValidityOn) {
        highlights.forEach(h => {
            countriesGroup.selectAll('path')
                .filter(d => d && d.properties && d.properties.name === h.name)
                .each(function () {
                    this.setAttribute('class', h.cls);
                    if (h.fill) this.style.fill = h.fill;
                    if (h.stroke) this.style.stroke = h.stroke;
                });
        });
    }

    // In the globe view, re-center on the target for auto-rotate modes.
    if (isGlobeView() && QUIZ_MODES[gameState.mode].autoRotate && gameState.targetCountry) {
        rotateToCountry(gameState.targetCountry);
    }
}

// (drawUSStatesWithInlays removed — replaced by d3.geoAlbersUsa composite projection)
function drawUSStatesWithInlays_UNUSED() {
    // Draw contiguous states
    countriesGroup.selectAll('path.contiguous')
        .data(gameState.contiguousStates)
        .enter()
        .append('path')
        .attr('class', 'country contiguous')
        .attr('d', path)
        .on('click', handleCountryClick);

    // DEBUG: red border around contiguous 48 bounds
    const cb = path.bounds({ type: 'FeatureCollection', features: gameState.contiguousStates });
    g.append('rect')
        .attr('x', cb[0][0]).attr('y', cb[0][1])
        .attr('width', cb[1][0] - cb[0][0]).attr('height', cb[1][1] - cb[0][1])
        .attr('fill', 'none').attr('stroke', 'red').attr('stroke-width', 3)
        .attr('stroke-dasharray', '6,3').attr('class', 'debug-box');

    // Create inlay boxes in the reserved bottom strip (100px)
    const inlayWidth = 120;
    const inlayHeight = 80;
    const inlayPadding = 10;
    const inlayY = height - 100 + (100 - inlayHeight) / 2; // centered in the 100px strip

    // Alaska inlay (bottom-left)
    if (gameState.alaskaState.length > 0) {
        const alaskaGroup = g.append('g')
            .attr('class', 'inlay-group alaska-inlay')
            .attr('transform', `translate(${inlayPadding}, ${inlayY})`);

        // Inlay box background
        alaskaGroup.append('rect')
            .attr('width', inlayWidth)
            .attr('height', inlayHeight)
            .attr('fill', '#f0f0f0')
            .attr('stroke', 'blue')
            .attr('stroke-width', 3)
            .attr('rx', 5);

        // Create projection for Alaska.
        // Alaska's Aleutians cross the antimeridian, so Mercator fitSize produces a
        // world-spanning bounding box. Use a rotated conic projection centered on Alaska
        // and fitExtent to the known geographic bounds instead.
        // Bbox (user-supplied): -179.136,51.229 → 179.774,71.352
        const akBboxPoly = {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [-179.13657211802118, 51.229087747767466],
                    [ 179.77488070600702, 51.229087747767466],
                    [ 179.77488070600702, 71.352561],
                    [-179.13657211802118, 71.352561],
                    [-179.13657211802118, 51.229087747767466]
                ]]
            }
        };
        const alaskaProjection = d3.geoConicEqualArea()
            .parallels([55, 65])
            .rotate([154, 0])
            .fitExtent([[5, 15], [inlayWidth - 5, inlayHeight - 5]], akBboxPoly);
        const alaskaPath = d3.geoPath().projection(alaskaProjection);

        // Draw Alaska
        alaskaGroup.selectAll('path.alaska')
            .data(gameState.alaskaState)
            .enter()
            .append('path')
            .attr('class', 'country alaska')
            .attr('d', d => alaskaPath(d))
            .attr('transform', 'translate(5, 15)')
            .on('click', handleCountryClick);

        // Label
        alaskaGroup.append('text')
            .attr('x', inlayWidth / 2)
            .attr('y', 12)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('fill', '#333')
            .text('AK');
    }

    // Hawaii inlay (bottom-center)
    if (gameState.hawaiiState.length > 0) {
        const hawaiiX = (width - inlayWidth) / 2;
        const hawaiiGroup = g.append('g')
            .attr('class', 'inlay-group hawaii-inlay')
            .attr('transform', `translate(${hawaiiX}, ${inlayY})`);

        // Inlay box background
        hawaiiGroup.append('rect')
            .attr('width', inlayWidth)
            .attr('height', inlayHeight)
            .attr('fill', '#f0f0f0')
            .attr('stroke', 'green')
            .attr('stroke-width', 3)
            .attr('rx', 5);

        // Create projection for Hawaii
        const hawaiiProjection = d3.geoMercator()
            .fitSize([inlayWidth - 10, inlayHeight - 20], {
                type: 'FeatureCollection',
                features: gameState.hawaiiState
            });
        const hawaiiPath = d3.geoPath().projection(hawaiiProjection);

        // Draw Hawaii
        hawaiiGroup.selectAll('path.hawaii')
            .data(gameState.hawaiiState)
            .enter()
            .append('path')
            .attr('class', 'country hawaii')
            .attr('d', d => hawaiiPath(d))
            .attr('transform', 'translate(5, 15)')
            .on('click', handleCountryClick);

        // Label
        hawaiiGroup.append('text')
            .attr('x', inlayWidth / 2)
            .attr('y', 12)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('fill', '#333')
            .text('HI');
    }

    // Puerto Rico inlay (bottom-right)
    if (gameState.puertoRicoState.length > 0) {
        const prX = width - inlayWidth - inlayPadding;
        const prGroup = g.append('g')
            .attr('class', 'inlay-group pr-inlay')
            .attr('transform', `translate(${prX}, ${inlayY})`);

        // Inlay box background
        prGroup.append('rect')
            .attr('width', inlayWidth)
            .attr('height', inlayHeight)
            .attr('fill', '#f0f0f0')
            .attr('stroke', 'magenta')
            .attr('stroke-width', 3)
            .attr('rx', 5);

        // Create projection for Puerto Rico
        const prProjection = d3.geoMercator()
            .fitSize([inlayWidth - 10, inlayHeight - 20], {
                type: 'FeatureCollection',
                features: gameState.puertoRicoState
            });
        const prPath = d3.geoPath().projection(prProjection);

        // Draw Puerto Rico
        prGroup.selectAll('path.pr')
            .data(gameState.puertoRicoState)
            .enter()
            .append('path')
            .attr('class', 'country pr')
            .attr('d', d => prPath(d))
            .attr('transform', 'translate(5, 15)')
            .on('click', handleCountryClick);

        // Label
        prGroup.append('text')
            .attr('x', inlayWidth / 2)
            .attr('y', 12)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('fill', '#333')
            .text('PR');
    }
}

// Handle country click
function handleCountryClick(event, d) {
    // Debug: draw the clicked country's bounding boxes (own + with-territories) before
    // any mode-specific early-returns, so it works no matter what question is active.
    if (debugValidityOn) drawDebugBoundingBoxes(d);

    // Handle free explore mode clicks
    if (gameState.questionType === 'free-explore') {
        const countryName = d.properties.name;
        showCountryPopup(countryName);
        return;
    }

    // Only allow clicking countries during location or mystery-flag questions
    if (gameState.questionType !== 'location' && gameState.questionType !== 'mystery-flag') return;
    if (gameState.answeredCorrectly) return;

    // Only allow ONE click per question
    if (gameState.guessedThisQuestion) return;

    gameState.guessedThisQuestion = true;
    gameState.scrollLocked = true; // Lock scrolling during animation

    const modeConfig = QUIZ_MODES[gameState.mode];
    // A click on an overseas territory counts as finding its sovereign parent.
    const clickedCountry = d.properties.parent || d.properties.name;
    const isCorrect = clickedCountry === gameState.targetCountry;

    if (isCorrect) {
        if (modeConfig.useWorldQuizLayout) {
            // For World Quiz Layout, color correct country bright green and zoom to it.
            // Fill the parent AND any overseas territories, not just the clicked feature.
            highlightCountryOnGlobe(gameState.targetCountry);
            gameState.answeredCorrectly = true;
            gameState.score++;
            document.getElementById('score').textContent = gameState.score; syncScoreDisplay();

            // Zoom to correct country, then advance
            zoomAndRotateToCountry(gameState.targetCountry, 800).then(() => {
                // Keep scrolling locked until next question
                clearAutoAdvance();
                autoAdvanceTimer = setTimeout(() => {
                    autoAdvanceTimer = null;
                    gameState.subQuestionIndex++;
                    startNewQuestion();
                }, ANSWER_PAUSE_MS);
            });
        } else {
            handleCorrectAnswer(event.target);
            // Fill parent + territories (clicking any part of a country reveals the whole).
            highlightCountryOnGlobe(gameState.targetCountry);
            gameState.scrollLocked = false;
        }
    } else {
        if (modeConfig.useWorldQuizLayout) {
            // For World Quiz Layout, color incorrect country red instantly
            const incorrectElement = d3.select(event.target);
            incorrectElement.classed('incorrect', true);
            raiseHighlight(incorrectElement);

            // Zoom to incorrect country and pause before revealing the correct one
            zoomAndRotateToCountry(clickedCountry, 600).then(() => {
                return new Promise(resolve => setTimeout(resolve, ANSWER_PAUSE_MS));
            }).then(() => {
                // Find and highlight the correct country in green (covers island dots too).
                // The wrong country stays red (never cleared) so both are visible together.
                highlightCountryOnGlobe(gameState.targetCountry);

                // Zoom to correct country
                return zoomAndRotateToCountry(gameState.targetCountry, 800);
            }).then(() => {
                // Advance to next sub-question after showing the correct answer
                clearAutoAdvance();
                autoAdvanceTimer = setTimeout(() => {
                    autoAdvanceTimer = null;
                    gameState.subQuestionIndex++;
                    startNewQuestion();
                }, ANSWER_PAUSE_MS);
            });
        } else {
            handleIncorrectAnswer(event.target);

            // Highlight the correct answer in green — the wrong one (marked above) is
            // never cleared, so both stay visible together.
            highlightCountryOnGlobe(gameState.targetCountry);

            // Auto-advance to next sub-question even on incorrect answer
            const maxSub = maxSubForMode(modeConfig);

            if (gameState.subQuestionIndex < maxSub - 1) {
                // Show correct (green) and incorrect (red), pause, then advance
                clearAutoAdvance();
                autoAdvanceTimer = setTimeout(() => {
                    autoAdvanceTimer = null;
                    gameState.subQuestionIndex++;
                    gameState.scrollLocked = false;
                    startNewQuestion();
                }, ANSWER_PAUSE_MS);
            } else {
                // All sub-questions complete — enable Next as a manual skip, and auto-advance.
                gameState.scrollLocked = false;
                document.getElementById('next-btn').disabled = false;

                // For mystery-flag mode, rotate the correct country into view (it's already
                // highlighted, but may be off-screen/unrotated-to).
                if (modeConfig.mysteryFlagMode) rotateToCountry(gameState.targetCountry);

                scheduleAutoAdvance();
            }
        }
    }
}

// Number of sub-questions (score-able steps) per target for a mode. Single-question
// modes score 1 point per target; find modes score per sub-question (location, +flag,
// +capital). Kept in ONE place so the per-answer and end-of-game maths never diverge
// (a mismatch is what made Shape-ID cap at 50% even on a perfect run).
function maxSubForMode(mc) {
    if (!mc) return 1;
    if (mc.identifyOnly || mc.mysteryFlagMode || mc.capitalsRaceMode || mc.countryShapeIdMode ||
        mc.skylineIdMode || mc.findOnly) {
        return 1;
    }
    return mc.hasFlags ? 3 : 2;
}

// ---- Shared answer pacing -------------------------------------------------------------
// One knob controls every quiz mode's reveal/advance pacing (Settings ▸ Gameplay). A
// CORRECT answer: pause, then advance. A WRONG answer: pause, THEN reveal the correct
// answer alongside it (the wrong highlight is never cleared, so the two stay visible
// together — see handleIncorrectAnswer), pause again, then advance. Distance/score-based
// modes (find-capital, spaceship, ordering) have no "wrong" to reveal against, so they use
// a single pause after the result is shown, same shape as a correct answer.
let ANSWER_PAUSE_MS = 1200;
let autoAdvanceTimer = null;

function clearAutoAdvance() {
    if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = null;
    }
}

function scheduleAutoAdvance(delay = ANSWER_PAUSE_MS) {
    clearAutoAdvance();
    autoAdvanceTimer = setTimeout(goToNextQuestion, delay);
}

function goToNextQuestion() {
    clearAutoAdvance();
    gameState.subQuestionIndex = 0;
    gameState.currentQuestion++;
    if (gameState.currentQuestion <= gameState.totalQuestions) {
        gameState.answeredCorrectly = false;
        startNewQuestion();
    } else {
        endGame();
    }
}

// Handle correct answer. `award` is false when this is only being used to reveal the answer
// and drive the advance after the player already got it WRONG — that path must not score.
function handleCorrectAnswer(element, award = true) {
    gameState.answeredCorrectly = true;
    if (award) gameState.score++;

    // Always confirm a correct answer with a green highlight (path, dot, or button).
    if (element) {
        const sel = d3.select(element).classed('selected', false).classed('target', true).classed('correct', true);
        // Raise map highlights so their outline isn't clipped by neighbouring shapes.
        if (element.ownerSVGElement) raiseHighlight(sel);
    }
    document.getElementById('score').textContent = gameState.score; syncScoreDisplay();

    // The round is decided (this also runs for the auto-reveal after a wrong answer), so the
    // photo credit can finally be shown without its title spoiling the city.
    if (gameState.questionType === 'skyline-id') revealSkylineCredit();

    // Determine max sub-questions based on mode
    const modeConfig = QUIZ_MODES[gameState.mode];
    const maxSub = maxSubForMode(modeConfig);

    // Pause briefly on the green confirmation before advancing — never instant.
    if (gameState.subQuestionIndex < maxSub - 1) {
        clearAutoAdvance();
        autoAdvanceTimer = setTimeout(() => {
            autoAdvanceTimer = null;
            gameState.subQuestionIndex++;
            startNewQuestion();
        }, ANSWER_PAUSE_MS);
    } else {
        // All sub-questions complete: enable Next as a manual skip and auto-advance.
        document.getElementById('next-btn').disabled = false;
        scheduleAutoAdvance();
    }
}

// Handle incorrect answer. Unlike a stale "self-clearing" flash, this highlight is left in
// place deliberately — the caller pauses, then reveals the correct answer ALONGSIDE it (see
// scheduleWrongThenCorrect) so the two can be compared, and the whole button/shape grid is
// rebuilt fresh for the next question anyway (clearMultipleChoice/startNewQuestion), so
// nothing needs to explicitly clear this class later.
function handleIncorrectAnswer(element) {
    const sel = d3.select(element).classed('selected', false).classed('incorrect', true);
    // Raise map highlights so the red outline isn't clipped by neighbouring shapes.
    if (element && element.ownerSVGElement) raiseHighlight(sel);
}

// The standard two-phase wrong-answer sequence used by every discrete right/wrong question
// type: pause, call `revealCorrect` (marks the correct answer — must NOT clear the existing
// wrong highlight), pause again, then advance (via handleCorrectAnswer, unscored).
function scheduleWrongThenCorrect(revealCorrect) {
    clearAutoAdvance();
    autoAdvanceTimer = setTimeout(() => {
        autoAdvanceTimer = null;
        const correctElement = revealCorrect();
        if (correctElement && !gameState.answeredCorrectly) handleCorrectAnswer(correctElement, false);
    }, ANSWER_PAUSE_MS);
}

// Handle give up - reveal answer without awarding points
function giveUp() {
    // Special handling for name-all mode
    const modeConfig = QUIZ_MODES[gameState.mode];
    if (modeConfig.nameAllMode) {
        handleNameAllGiveUp();
        return;
    }

    if (modeConfig.findCapitalMode) {
        skipCapitalGuess();
        return;
    }

    if (modeConfig.spaceshipMode) {
        skipSpaceshipGuess();
        return;
    }

    // Skyline ID: reveal the city on the option buttons. Needs its own handler because the
    // generic tail below reaches for the globe, which this mode doesn't have.
    if (modeConfig.skylineIdMode) {
        if (gameState.answeredCorrectly || !gameState.targetCountry) return; // nothing to reveal yet
        gameState.answeredCorrectly = true;
        const label = skylineLabel(gameState.targetCountry);
        document.querySelectorAll('.option-btn').forEach(btn => {
            if (btn.textContent === label) btn.classList.add('correct');
        });
        const feedback = document.getElementById('feedback');
        feedback.textContent = 'This is ' + label + '.';
        feedback.className = 'feedback incorrect';
        revealSkylineCredit();
        document.getElementById('next-btn').disabled = false;
        scheduleAutoAdvance();
        return;
    }

    // Special handling for capitals-race mode
    if (modeConfig.capitalsRaceMode) {
        if (gameState.answeredCorrectly) return;
        gameState.answeredCorrectly = true;
        const correctCapital = getCapital(gameState.targetCountry);
        const feedback = document.getElementById('feedback');
        feedback.textContent = `The capital of ${gameState.targetCountry} is: ${correctCapital}`;
        feedback.className = 'feedback incorrect';
        const capitalsInput = document.getElementById('capitals-race-input');
        if (capitalsInput) capitalsInput.disabled = true;
        document.getElementById('next-btn').disabled = false;
        scheduleAutoAdvance();
        return;
    }

    if (gameState.answeredCorrectly) return; // Already answered correctly

    gameState.answeredCorrectly = true; // Mark as answered to prevent further input

    const feedback = document.getElementById('feedback');
    feedback.textContent = `The correct answer is: ${gameState.targetCountry}`;
    feedback.className = 'feedback incorrect';

    // Show the correct answer visually
    if (gameState.questionType === 'location') {
        // Highlight the country on the map
        highlightCountryOnGlobe(gameState.targetCountry);
        // Rotate to show it if autoRotate is enabled
        if (modeConfig.useGlobe && modeConfig.autoRotate) {
            rotateToCountry(gameState.targetCountry);
        }
    } else if (gameState.questionType === 'flag') {
        // Highlight correct flag
        const flagOptions = document.querySelectorAll('.flag-option');
        flagOptions.forEach(opt => {
            const img = opt.querySelector('img');
            if (img && img.src === getFlagUrl(gameState.targetCountry)) {
                opt.classList.add('correct');
            }
        });
        // The flag has been revealed — colour the country in with it, same as answering.
        fillCountryWithFlag(gameState.targetCountry);
    } else if (gameState.questionType === 'capital') {
        // Highlight correct capital
        const correctCapital = getCapital(gameState.targetCountry);
        const buttons = document.querySelectorAll('.option-btn');
        buttons.forEach(btn => {
            if (btn.textContent === correctCapital) {
                btn.classList.add('correct');
            }
        });
    } else if (gameState.questionType === 'identify') {
        // Already highlighted, just show in feedback
        feedback.textContent = `The highlighted location is: ${gameState.targetCountry}`;
    } else if (gameState.questionType === 'mystery-flag') {
        // Reveal and rotate to the correct country
        highlightCountryOnGlobe(gameState.targetCountry);
        rotateToCountry(gameState.targetCountry);
        feedback.textContent = `The flag belongs to: ${gameState.targetCountry}`;
    } else if (gameState.questionType === 'country-shape-id') {
        // Highlight the correct country
        countriesGroup.selectAll('path')
            .classed('target-muted', false);
        feedback.textContent = `The correct answer is: ${gameState.targetCountry}`;
        const buttons = document.querySelectorAll('.option-btn');
        buttons.forEach(btn => {
            if (btn.textContent === gameState.targetCountry) {
                btn.classList.add('correct');
            }
        });
    }

    // Determine max sub-questions based on mode
    const maxSub = maxSubForMode(modeConfig);

    // Pause on the reveal, then advance — same pacing as answering (right or wrong).
    if (gameState.subQuestionIndex < maxSub - 1) {
        clearAutoAdvance();
        autoAdvanceTimer = setTimeout(() => {
            autoAdvanceTimer = null;
            gameState.subQuestionIndex++;
            startNewQuestion();
        }, ANSWER_PAUSE_MS);
    } else {
        document.getElementById('next-btn').disabled = false;
        scheduleAutoAdvance();
    }
}

// Start a new question
function startNewQuestion() {
    // Cancel any pending auto-advance and globe spin from the previous question
    clearAutoAdvance();
    stopGlobeSpin();

    // Check if this is name-all mode
    const modeConfig = QUIZ_MODES[gameState.mode];
    if (modeConfig.nameAllMode) {
        renderNameAllMode();
        return;
    }

    // Check if this is ordering mode (population ordering)
    if (modeConfig.orderingMode) {
        renderOrderingMode();
        return;
    }

    // Skyline ID must hook in HERE, with the other map-less modes, not down at the render
    // dispatch: the shared code below dereferences countriesGroup (never created without a
    // map) and picks its target by filtering the quiz list against map features, which for
    // an empty gameState.countries recurses forever. Skyline picks its own target instead.
    if (modeConfig.skylineIdMode) {
        renderSkylineQuestion();
        return;
    }

    // Check if this is free explore mode
    if (modeConfig.freeExploreMode) {
        renderFreeExploreMode();
        return;
    }

    // Remove name-all-mode class if it exists
    document.querySelector('.container').classList.remove('name-all-mode');

    // Show question counter again (might have been hidden by name-all mode)
    const questionCounter = document.querySelector('.score-item:has(#current-question)');
    if (questionCounter) {
        questionCounter.style.display = '';
    }

    // Reset state
    gameState.answeredCorrectly = false;
    gameState.guessedThisQuestion = false;
    gameState.scrollLocked = false;
    document.getElementById('next-btn').disabled = true;
    document.getElementById('next-btn').style.display = 'inline-block';
    document.getElementById('next-btn').textContent = 'Next Question';
    document.getElementById('give-up-btn').style.display = 'inline-block';
    document.getElementById('give-up-btn').textContent = 'Give Up';

    // Clear feedback
    const feedback = document.getElementById('feedback');
    feedback.textContent = '';
    feedback.className = 'feedback';

    // Clear previous styling (only for non-World Quiz Layout or when starting new country)
    if (!modeConfig.useWorldQuizLayout || gameState.subQuestionIndex === 0) {
        countriesGroup.selectAll('path')
            .classed('target', false)
            .classed('target-muted', false)
            .classed('selected', false)
            .classed('incorrect', false);
        if (islandMarkersGroup) {
            islandMarkersGroup.selectAll('circle')
                .classed('target', false)
                .classed('target-muted', false)
                .classed('selected', false)
                .classed('incorrect', false);
        }
    } else if (gameState.subQuestionIndex > 0 && !modeConfig.useWorldQuizLayout) {
        // For follow-up questions in non-world-quiz modes, only clear incorrect/selected but keep target highlighted
        countriesGroup.selectAll('path')
            .classed('selected', false)
            .classed('incorrect', false);
    }

    // Clear multiple choice
    clearMultipleChoice();
    clearDebugBoundingBoxes();

    // Hide name-all input if exists
    const inputContainer = document.getElementById('name-all-input-container');
    if (inputContainer) {
        inputContainer.style.display = 'none';
    }

    // Hide capitals-race input if exists
    const capitalsRaceInputContainer = document.getElementById('capitals-race-input-container');
    if (capitalsRaceInputContainer) {
        capitalsRaceInputContainer.style.display = 'none';
    }

    // Check if game is over
    if (gameState.currentQuestion > gameState.totalQuestions) {
        endGame();
        return;
    }

    // Find-the-Capital handles its own target selection and rendering.
    if (modeConfig.findCapitalMode) {
        renderFindCapitalQuestion();
        return;
    }

    // Where Is My Spaceship? handles its own target selection and rendering.
    if (modeConfig.spaceshipMode) {
        renderSpaceshipQuestion();
        return;
    }

    // If starting a new item (subQuestionIndex === 0), select a new item
    if (gameState.subQuestionIndex === 0) {
        // Get available items that haven't been used
        const availableItems = gameState.currentQuizList.filter(item => {
            // Check if item exists in our data and hasn't been used
            const exists = gameState.countries.some(c => c.properties.name === item);
            return exists && !gameState.usedCountries.has(item);
        });

        if (availableItems.length === 0) {
            // Reset used items if we've gone through all of them
            gameState.usedCountries.clear();
            startNewQuestion();
            return;
        }

        // Select random item
        const randomIndex = Math.floor(Math.random() * availableItems.length);
        gameState.targetCountry = availableItems[randomIndex];
        gameState.usedCountries.add(gameState.targetCountry);

        // Check if this is identify-only mode
        const modeConfig = QUIZ_MODES[gameState.mode];
        if (modeConfig.identifyOnly) {
            gameState.questionType = 'identify';
        } else if (modeConfig.mysteryFlagMode) {
            gameState.questionType = 'mystery-flag';
        } else if (modeConfig.capitalsRaceMode) {
            gameState.questionType = 'capitals-race';
        } else if (modeConfig.countryShapeIdMode) {
            gameState.questionType = 'country-shape-id';
        } else {
            gameState.questionType = 'location';
        }
    }

    // Update question number display
    document.getElementById('current-question').textContent = gameState.currentQuestion; syncScoreDisplay();

    // Render the appropriate question based on subQuestionIndex
    const hasFlags = modeConfig.hasFlags;

    if (modeConfig.identifyOnly) {
        // Identify mode only shows identify questions
        renderIdentifyQuestion();
    } else if (modeConfig.mysteryFlagMode) {
        renderMysteryFlagQuestion();
    } else if (modeConfig.capitalsRaceMode) {
        renderCapitalsRaceQuestion();
    } else if (modeConfig.countryShapeIdMode) {
        renderCountryShapeIdQuestion();
    } else if (gameState.subQuestionIndex === 0) {
        renderLocationQuestion();
    } else if (gameState.subQuestionIndex === 1 && hasFlags) {
        renderFlagQuestion();
    } else if (gameState.subQuestionIndex === 1 && !hasFlags) {
        // Skip flags for modes without flags, go to capital
        renderCapitalQuestion();
    } else if (gameState.subQuestionIndex === 2) {
        renderCapitalQuestion();
    }
}

// Render location question (original: find country/state on map)
function renderLocationQuestion() {
    gameState.questionType = 'location';
    const modeConfig = QUIZ_MODES[gameState.mode];
    const itemLabel = modeConfig.itemLabel;

    if (modeConfig.useWorldQuizLayout) {
        // For World Quiz Layout, show location prompt in question bar
        document.getElementById('world-quiz-current-question').innerHTML = `Click the globe to find: <strong>${gameState.targetCountry}</strong>`;
        document.getElementById('flag-question-text').innerHTML = '';
        document.getElementById('flag-choice-container').style.display = 'none';
        document.getElementById('flag-display-side').style.display = 'none';
        document.getElementById('flag-feedback').textContent = '';
        document.getElementById('flag-feedback').className = 'feedback';
        document.getElementById('capital-question-text').innerHTML = '';
        document.getElementById('capital-choice-container').style.display = 'none';
        document.getElementById('capital-feedback').textContent = '';
    } else {
        // Standard layout
        document.getElementById('question-text').innerHTML = `Find: <span id="country-name">${gameState.targetCountry}</span>`;
        
        document.getElementById('multiple-choice-container').classList.add('hidden');
        document.getElementById('flag-display').style.display = 'none';
    }

    // Rotate globe/map to show the target only if autoRotate is enabled
    if (isGlobeView() && modeConfig.autoRotate) {
        rotateToCountry(gameState.targetCountry);
    } else if (isGlobeView() && !modeConfig.autoRotate && !modeConfig.useWorldQuizLayout) {
        // Reset to 0,0,0 for modes that need it (but not World Quiz Layout)
        projection.rotate([0, 0, 0]);
        r_unconstrained = [0, 0, 0];
        countriesGroup.selectAll('path').attr('d', path);
        updateIslandMarkers();
    }
    // For World Quiz Layout, maintain current rotation/zoom between questions
    // For regional maps, just ensure it's visible (already fitted in loadMapData)
}

// Render flag question (show 4 flags and choose the correct one)
function renderFlagQuestion() {
    console.log('renderFlagQuestion called for:', gameState.targetCountry);
    gameState.questionType = 'flag';
    const modeConfig = QUIZ_MODES[gameState.mode];
    const itemLabel = modeConfig.itemLabel;

    // Generate multiple choice options
    const options = generateMultipleChoiceOptions(gameState.targetCountry, 'item');
    console.log('Generated options:', options);

    if (modeConfig.useWorldQuizLayout) {
        // For World Quiz Layout, show flag question in question bar
        document.getElementById('world-quiz-current-question').innerHTML = `Which flag belongs to <strong>${gameState.targetCountry}</strong>?`;
        document.getElementById('flag-question-text').innerHTML = '';
        document.getElementById('flag-display-side').style.display = 'none';

        // Keep the target country highlighted with muted color
        countriesGroup.selectAll('path')
            .filter(d => d.properties.name === gameState.targetCountry)
            .classed('target-muted', true);

        // Render flag choices in the top panel
        const grid = document.getElementById('flag-options-grid');
        grid.innerHTML = '';
        grid.className = 'flag-options-grid';

        options.forEach(option => {
            const flagDiv = document.createElement('div');
            flagDiv.className = 'flag-option';

            const flagImg = document.createElement('img');
            const flagUrl = getFlagUrl(option);
            console.log(`Setting image src for ${option} to: ${flagUrl}`);
            flagImg.src = flagUrl;
            flagImg.alt = `Flag of ${option}`;

            flagDiv.appendChild(flagImg);
            flagDiv.onclick = () => handleFlagChoiceAnswer(option, gameState.targetCountry, flagDiv);
            grid.appendChild(flagDiv);
        });

        document.getElementById('flag-choice-container').style.display = 'block';
    } else {
        // Standard layout
        document.getElementById('question-text').innerHTML = `Which flag belongs to <span id="country-name">${gameState.targetCountry}</span>?`;
        document.getElementById('flag-display').style.display = 'none';
        

        // Render flag choices
        renderFlagChoices(options, gameState.targetCountry);
    }
}

// Render flag choices (4 flag images)
function renderFlagChoices(options, correctAnswer) {
    const container = document.getElementById('multiple-choice-container');
    const grid = document.getElementById('options-grid');
    grid.innerHTML = '';
    grid.className = 'flag-options-grid';

    options.forEach(option => {
        const flagDiv = document.createElement('div');
        flagDiv.className = 'flag-option';

        const flagImg = document.createElement('img');
        flagImg.src = getFlagUrl(option);
        flagImg.alt = `Flag of ${option}`;

        flagDiv.appendChild(flagImg);
        flagDiv.onclick = () => handleFlagChoiceAnswer(option, correctAnswer, flagDiv);
        grid.appendChild(flagDiv);
    });

    container.classList.remove('hidden');
}

// Handle flag choice answer
function handleFlagChoiceAnswer(selectedAnswer, correctAnswer, element) {
    if (gameState.answeredCorrectly) return;

    const modeConfig = QUIZ_MODES[gameState.mode];
    const isCorrect = selectedAnswer === correctAnswer;

    // Visual feedback
    element.classList.add('selected');

    if (isCorrect) {
        element.classList.add('correct');

        if (modeConfig.useWorldQuizLayout) {
            // Handle correct answer logic
            gameState.answeredCorrectly = true;
            gameState.score++;
            document.getElementById('score').textContent = gameState.score; syncScoreDisplay();

            // The flag has now been asked — colour the country in with it.
            fillCountryWithFlag(correctAnswer);

            // Pause on the green confirmation, then advance to the capital question.
            clearAutoAdvance();
            autoAdvanceTimer = setTimeout(() => {
                autoAdvanceTimer = null;
                gameState.subQuestionIndex++;
                startNewQuestion();
            }, ANSWER_PAUSE_MS);
        } else {
            fillCountryWithFlag(correctAnswer);
            handleCorrectAnswer(element);
        }
    } else {
        element.classList.add('incorrect');
        handleIncorrectAnswer(element);
        // Reveal the correct flag alongside the wrong one, then advance (unscored) — the
        // world-quiz-layout branch used to just clear and loop with no reveal/advance at
        // all; both branches now share the standard wrong-answer pacing.
        scheduleWrongThenCorrect(() => {
            let correctElement = null;
            document.querySelectorAll('.flag-option').forEach(opt => {
                const img = opt.querySelector('img');
                if (img && img.src === getFlagUrl(correctAnswer)) {
                    opt.classList.add('correct');
                    correctElement = opt;
                }
            });
            // The flag has now been asked (right or wrong) — colour the country in with it,
            // same as a correct guess does.
            if (modeConfig.useWorldQuizLayout) fillCountryWithFlag(correctAnswer);
            return correctElement;
        });
    }
}

// Render capital question
function renderCapitalQuestion() {
    gameState.questionType = 'capital';
    const modeConfig = QUIZ_MODES[gameState.mode];
    const correctCapital = getCapital(gameState.targetCountry);

    // Generate multiple choice options with capitals
    const itemOptions = generateMultipleChoiceOptions(gameState.targetCountry, 'item');
    const capitalOptions = itemOptions.map(item => getCapital(item)).filter(cap => cap !== null);

    if (modeConfig.useWorldQuizLayout) {
        // For World Quiz Layout, show capital question in question bar
        document.getElementById('world-quiz-current-question').innerHTML = `What is the capital of <strong>${gameState.targetCountry}</strong>?`;
        document.getElementById('capital-question-text').innerHTML = '';

        // Keep the target country highlighted with muted color
        countriesGroup.selectAll('path')
            .filter(d => d.properties.name === gameState.targetCountry)
            .classed('target-muted', true);

        // Render capital choices in the bottom panel
        const grid = document.getElementById('capital-options-grid');
        grid.innerHTML = '';
        grid.className = 'options-grid';

        capitalOptions.forEach(option => {
            const button = document.createElement('button');
            button.className = 'option-btn';
            button.textContent = option;
            button.onclick = () => handleCapitalChoiceAnswer(option, correctCapital, button);
            grid.appendChild(button);
        });

        document.getElementById('capital-choice-container').style.display = 'block';
    } else {
        // Standard layout
        document.getElementById('question-text').innerHTML = `What is the capital of <span id="country-name">${gameState.targetCountry}</span>?`;
        document.getElementById('flag-display').style.display = 'none';
        

        renderMultipleChoice(capitalOptions, correctCapital);
    }
}

// Handle capital choice answer (for World Quiz Layout)
function handleCapitalChoiceAnswer(selectedAnswer, correctAnswer, element) {
    if (gameState.answeredCorrectly) return;

    const isCorrect = selectedAnswer === correctAnswer;

    // Visual feedback
    element.classList.add('selected');

    if (isCorrect) {
        element.classList.add('correct');

        // Handle correct answer logic
        gameState.answeredCorrectly = true;
        gameState.score++;
        document.getElementById('score').textContent = gameState.score; syncScoreDisplay();

        // Pause on the green confirmation, then advance to the next country.
        document.getElementById('next-btn').disabled = false;
        scheduleAutoAdvance();
    } else {
        element.classList.add('incorrect');
        handleIncorrectAnswer(element);
        // Reveal the correct capital alongside the wrong one, then advance (unscored) —
        // this used to just clear and loop with no reveal/advance at all.
        scheduleWrongThenCorrect(() => {
            let correctElement = null;
            document.querySelectorAll('#capital-options-grid .option-btn').forEach(btn => {
                if (btn.textContent === correctAnswer) {
                    btn.classList.add('correct');
                    correctElement = btn;
                }
            });
            return correctElement;
        });
    }
}

// Render identify question (show country/state on map, identify name)
function renderIdentifyQuestion() {
    gameState.questionType = 'identify';
    const itemLabel = QUIZ_MODES[gameState.mode].itemLabel;
    document.getElementById('question-text').innerHTML = `Which ${itemLabel} is highlighted?`;

    document.getElementById('flag-display').style.display = 'none';

    // Highlight the item on the map
    highlightCountryOnGlobe(gameState.targetCountry);

    // Stop any existing globe spin (identify mode no longer auto-spins).
    stopGlobeSpin();

    // Rotate once to bring the highlighted target into view (no continuous spin).
    if (QUIZ_MODES[gameState.mode].useGlobe) {
        rotateToCountry(gameState.targetCountry);
    }

    // Generate multiple choice options
    const options = generateMultipleChoiceOptions(gameState.targetCountry, 'item');
    renderMultipleChoice(options, gameState.targetCountry);
}

// Render name-all mode question
// ===== Name-All countdown timer =====
function stopNameAllTimer() {
    if (gameState.nameAllTimerId) { clearInterval(gameState.nameAllTimerId); gameState.nameAllTimerId = null; }
}

function renderNameAllTimer() {
    const el = document.getElementById('name-all-timer');
    if (!el) return;
    const s = Math.max(0, gameState.nameAllTimeLeft | 0);
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.style.color = s <= 10 ? 'var(--incorrect)' : '';
}

function startNameAllTimer(seconds) {
    stopNameAllTimer();
    gameState.nameAllTimeLeft = seconds;
    renderNameAllTimer();
    gameState.nameAllTimerId = setInterval(() => {
        // Self-cancel if the player has left name-all mode.
        const mc = QUIZ_MODES[gameState.mode];
        if (!mc || !mc.nameAllMode) { stopNameAllTimer(); return; }
        gameState.nameAllTimeLeft--;
        renderNameAllTimer();
        if (gameState.nameAllTimeLeft <= 0) {
            stopNameAllTimer();
            if (!gameState.nameAllGaveUp) handleNameAllGiveUp(true);
        }
    }, 1000);
}

// A country is playable in Name-All if it's drawn as a polygon OR as an island dot.
function nameAllRenderable(name) {
    if (gameState.countries && gameState.countries.some(c => c.properties.name === name)) return true;
    const d = gameState.currentDataObj[name];
    return !!(d && Array.isArray(d.capitalCoords));
}

function renderNameAllMode() {
    const modeConfig = QUIZ_MODES[gameState.mode];
    gameState.questionType = 'name-all';
    gameState.foundCountries = new Set();
    gameState.nameAllStartTime = Date.now();
    gameState.nameAllGaveUp = false;
    stopNameAllTimer();

    // Add name-all-mode class to container for styling
    document.querySelector('.container').classList.add('name-all-mode');

    // Keep only items that are drawn (as a polygon or, for world countries, an island dot).
    gameState.currentQuizList = gameState.currentQuizList.filter(nameAllRenderable);
    const totalItems = gameState.currentQuizList.length;
    const itemWord = modeConfig.itemLabelPlural || 'countries';

    // Hide question counter for name-all mode
    const questionCounter = document.querySelector('.score-item:has(#current-question)');
    if (questionCounter) {
        questionCounter.style.display = 'none';
    }

    const regionLabel = modeConfig.regionLabel || 'the World';
    document.getElementById('question-text').innerHTML = `Name all ${itemWord} in ${regionLabel}! Found: <span id="found-count">0</span>/${totalItems} &nbsp;|&nbsp; ⏱ <span id="name-all-timer">--:--</span>`;

    document.getElementById('flag-display').style.display = 'none';
    document.getElementById('multiple-choice-container').classList.add('hidden');

    // Create and show input field
    createNameAllInput();

    // Start the countdown (~6s per item, at least 60s).
    startNameAllTimer(Math.max(60, totalItems * 6));

    // Reset rotation — only orthographic/Mercator support .rotate(); AlbersUSA (us-states)
    // does not, so it's skipped there (its extent is already fixed).
    if (typeof projection.rotate === 'function') {
        projection.rotate([0, 0, 0]);
        r_unconstrained = [0, 0, 0];
    }

    // Ensure all countries are visible with clear borders
    countriesGroup.selectAll('path')
        .attr('d', path)
        .classed('target', false)
        .classed('incorrect', false)
        .classed('selected', false)
        .style('fill', null)        // Revert to themed land color (CSS .country)
        .style('stroke', null)
        .style('stroke-width', null)
        .style('opacity', 1);       // Ensure full opacity

    // Reset and reposition island-dot markers for this fresh game.
    if (islandMarkersGroup) {
        islandMarkersGroup.selectAll('circle')
            .classed('target', false).classed('incorrect', false).classed('selected', false);
    }
    updateIslandMarkers();

    // Update button states
    document.getElementById('next-btn').style.display = 'none';
    document.getElementById('give-up-btn').style.display = 'inline-block';
    document.getElementById('restart-btn').style.display = 'inline-block';
}

// Create input field for name-all mode
function createNameAllInput() {
    // Check if input already exists
    let inputContainer = document.getElementById('name-all-input-container');
    if (!inputContainer) {
        inputContainer = document.createElement('div');
        inputContainer.id = 'name-all-input-container';
        inputContainer.className = 'name-all-input-container';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'name-all-input';
        input.className = 'name-all-input';
        input.autocomplete = 'off';

        inputContainer.appendChild(input);

        // Insert after question container
        const questionContainer = document.getElementById('question-container');
        questionContainer.appendChild(inputContainer);

        // Add event listener for real-time input
        input.addEventListener('input', handleNameAllInput);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
            }
        });
    }

    // Placeholder depends on the geography (country/state/county), so it's refreshed on
    // every call — not just when the element is first created — in case the player
    // switched geographies since the input was last built.
    const modeConfig = QUIZ_MODES[gameState.mode];
    const input = document.getElementById('name-all-input');
    input.placeholder = `Type a ${modeConfig.itemLabel || 'country'} name...`;

    // Show and focus input
    inputContainer.style.display = 'block';
    input.value = '';
    input.focus();
}

// Handle input changes in name-all mode
function handleNameAllInput(event) {
    if (gameState.nameAllGaveUp) return;

    const input = event.target;
    const inputValue = input.value.trim();

    if (!inputValue) return;

    // Normalize input for comparison (lowercase, remove extra spaces)
    const normalizedInput = inputValue.toLowerCase().replace(/\s+/g, ' ');

    // Check against all countries in the quiz list
    for (const countryName of gameState.currentQuizList) {
        const countryData = gameState.currentDataObj[countryName];
        if (!gameState.foundCountries.has(countryName)) {
            // Check exact match
            const normalizedCountryName = countryName.toLowerCase().replace(/\s+/g, ' ');
            if (normalizedCountryName === normalizedInput) {
                foundCountryMatch(countryName, input);
                return;
            }

            // Check alternate names if available
            if (countryData && countryData.alternateNames && Array.isArray(countryData.alternateNames)) {
                for (const altName of countryData.alternateNames) {
                    const normalizedAltName = altName.toLowerCase().replace(/\s+/g, ' ');
                    if (normalizedAltName === normalizedInput) {
                        foundCountryMatch(countryName, input);
                        return;
                    }
                }
            }
        }
    }
}

// Helper function for found country match
function foundCountryMatch(countryName, inputElement) {
    // Found a match!
    gameState.foundCountries.add(countryName);
    gameState.score++;

    // Highlight country on globe
    highlightFoundCountry(countryName);

    // Clear input
    inputElement.value = '';

    // Update counter
    updateFoundCounter();

    // Check if all countries found
    checkNameAllComplete();
}

// Highlight a found country in name-all mode (plus its overseas territories).
function highlightFoundCountry(countryName) {
    const paths = countriesGroup.selectAll('path')
        .filter(d => featureBelongsTo(d, countryName))
        .classed('target', true);
    raiseHighlight(paths);

    // Island nations are dots, not polygons — highlight the marker too.
    if (islandMarkersGroup) {
        const dots = islandMarkersGroup.selectAll('circle')
            .filter(d => featureBelongsTo(d, countryName))
            .classed('target', true);
        raiseHighlight(dots);
    }

    // Smoothly zoom to the country
    zoomAndRotateToCountry(countryName, 600);
}

// Update the found counter display
function updateFoundCounter() {
    const totalCountries = gameState.currentQuizList.length;

    document.getElementById('found-count').textContent = gameState.foundCountries.size;
    document.getElementById('score').textContent = gameState.score; syncScoreDisplay();
}

// Check if all items have been found
function checkNameAllComplete() {
    const totalItems = gameState.currentQuizList.length;

    if (gameState.foundCountries.size >= totalItems) {
        // All items found!
        stopNameAllTimer();
        const elapsedTime = Math.round((Date.now() - gameState.nameAllStartTime) / 1000);
        const minutes = Math.floor(elapsedTime / 60);
        const seconds = elapsedTime % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        const itemWord = (QUIZ_MODES[gameState.mode].itemLabelPlural) || 'countries';
        const feedback = document.getElementById('feedback');
        feedback.textContent = `🎉 Congratulations! You named all ${totalItems} ${itemWord} in ${timeStr}!`;
        feedback.className = 'feedback correct';

        // Hide input
        const inputContainer = document.getElementById('name-all-input-container');
        if (inputContainer) {
            inputContainer.style.display = 'none';
        }

        // Update button states
        document.getElementById('give-up-btn').style.display = 'none';
    }
}

// Handle give up for name-all mode (timedOut=true when the countdown hit zero)
function handleNameAllGiveUp(timedOut) {
    gameState.nameAllGaveUp = true;
    stopNameAllTimer();

    // Hide input
    const inputContainer = document.getElementById('name-all-input-container');
    if (inputContainer) {
        inputContainer.style.display = 'none';
    }

    // Highlight all missed items in red and create list
    const missedItems = [];
    gameState.currentQuizList.forEach(itemName => {
        if (!gameState.foundCountries.has(itemName)) {
            missedItems.push(itemName);

            // Highlight in red (polygon or island dot)
            countriesGroup.selectAll('path')
                .filter(d => d.properties.name === itemName)
                .classed('incorrect', true);
            if (islandMarkersGroup) {
                islandMarkersGroup.selectAll('circle')
                    .filter(d => d.properties.name === itemName)
                    .classed('incorrect', true);
            }
        }
    });

    // Show feedback with missed items
    const totalItems = gameState.currentQuizList.length;
    const itemWord = (QUIZ_MODES[gameState.mode].itemLabelPlural) || 'countries';

    const feedback = document.getElementById('feedback');
    feedback.innerHTML = `
        <div>
            <p>${timedOut ? "⏰ Time's up! " : ''}You found ${gameState.foundCountries.size} out of ${totalItems} ${itemWord}.</p>
            <p style="margin-top: 10px;"><strong>Missed ${itemWord}:</strong></p>
            <div style="max-height: 200px; overflow-y: auto; margin-top: 10px; text-align: left;">
                ${missedItems.sort().map(name => `<div style="padding: 3px 0;">• ${name}</div>`).join('')}
            </div>
        </div>
    `;
    feedback.className = 'feedback incorrect';

    // Update button states
    document.getElementById('give-up-btn').style.display = 'none';
}

// ==================== MYSTERY FLAG MODE ====================

// Render mystery flag question (show flag, click globe to find country)
function renderMysteryFlagQuestion() {
    gameState.questionType = 'mystery-flag';
    const flagUrl = getFlagUrl(gameState.targetCountry);

    document.getElementById('question-text').innerHTML = `Which country does this flag belong to? <span style="font-size:0.8em;color:#888;">Find it on the globe!</span>`;

    // Show flag prominently
    const flagDisplay = document.getElementById('flag-display');
    const flagImg = document.getElementById('flag-image');
    flagImg.src = flagUrl;
    flagImg.alt = 'Mystery Flag';
    flagDisplay.style.display = 'block';

    document.getElementById('multiple-choice-container').classList.add('hidden');
}

// ==================== CAPITALS RACE MODE ====================

// Render capitals race question (highlight country on globe, type the capital)
function renderCapitalsRaceQuestion() {
    gameState.questionType = 'capitals-race';

    document.getElementById('question-text').innerHTML = `What is the capital of <strong>${gameState.targetCountry}</strong>?`;
    document.getElementById('flag-display').style.display = 'none';
    document.getElementById('multiple-choice-container').classList.add('hidden');

    // Highlight country and rotate to it
    highlightCountryOnGlobe(gameState.targetCountry);
    rotateToCountry(gameState.targetCountry);

    // Show input
    createCapitalsRaceInput();
}

// Create input field for capitals race mode
function createCapitalsRaceInput() {
    let inputContainer = document.getElementById('capitals-race-input-container');
    if (!inputContainer) {
        inputContainer = document.createElement('div');
        inputContainer.id = 'capitals-race-input-container';
        inputContainer.className = 'name-all-input-container';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'capitals-race-input';
        input.className = 'name-all-input';
        input.placeholder = 'Type the capital city...';
        input.autocomplete = 'off';

        inputContainer.appendChild(input);

        const questionContainer = document.getElementById('question-container');
        questionContainer.appendChild(inputContainer);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleCapitalsRaceSubmit();
            }
        });
    }

    inputContainer.style.display = 'block';
    const input = document.getElementById('capitals-race-input');
    input.value = '';
    input.disabled = false;
    input.focus();
}

// Handle capitals race answer submission
function handleCapitalsRaceSubmit() {
    if (gameState.answeredCorrectly) return;

    const input = document.getElementById('capitals-race-input');
    const typed = input.value.trim();
    if (!typed) return;

    const correctCapital = getCapital(gameState.targetCountry);
    if (!correctCapital) {
        console.error(`No capital data found for ${gameState.targetCountry}`);
        return;
    }
    const isCorrect = typed.toLowerCase() === correctCapital.toLowerCase();

    const feedback = document.getElementById('feedback');
    input.disabled = true;
    gameState.answeredCorrectly = true;

    if (isCorrect) {
        gameState.score++;
        document.getElementById('score').textContent = gameState.score; syncScoreDisplay();
        feedback.textContent = `Correct! ${correctCapital} is the capital of ${gameState.targetCountry}.`;
        feedback.className = 'feedback correct';
    } else {
        feedback.textContent = `Incorrect. The capital of ${gameState.targetCountry} is ${correctCapital}.`;
        feedback.className = 'feedback incorrect';
    }
    // The correct capital is already shown in the feedback text either way (a typed-input
    // answer has no separate "highlight" step to sequence), so both outcomes get the same
    // single pause before auto-advancing.
    document.getElementById('next-btn').disabled = false;
    scheduleAutoAdvance();
}

// ==================== FREE EXPLORE MODE ====================

// Render free explore mode (interactive globe with popups)
function renderFreeExploreMode() {
    gameState.questionType = 'free-explore';

    document.getElementById('question-text').innerHTML = `<strong>Explore the Globe</strong><br><span style="font-size:0.8em;color:#888;">Click any country to see details</span>`;
    document.getElementById('flag-display').style.display = 'none';
    document.getElementById('multiple-choice-container').classList.add('hidden');

    // Hide standard buttons and repurpose restart button for exit
    document.getElementById('next-btn').style.display = 'none';
    document.getElementById('give-up-btn').style.display = 'none';
    document.getElementById('restart-btn').textContent = 'Exit Explore';
    document.getElementById('restart-btn').onclick = exitFreeExplore;
    document.getElementById('restart-btn').style.display = 'inline-block';
}

// Handle exit from free explore mode
function exitFreeExplore() {
    // Return to landing page
    goHome();
}

// Show country popup with stats and flag
function showCountryPopup(countryName) {
    // Territories carry the sovereign parent's flag/capital/population and are
    // titled e.g. "Puerto Rico (USA)".
    const dataName = effectiveDataName(countryName);
    const title = displayLabelForName(countryName);
    const data = lookupDataEntry(dataName, gameState.currentDataObj);
    if (!data) {
        console.warn(`No data found for ${countryName}`);
        return;
    }

    const flagUrl = getFlagUrl(dataName);
    const capital = getCapital(dataName) || 'N/A';
    const population = data.population ? data.population.toLocaleString() : 'N/A';

    const popupHtml = `
        <div class="explore-popup-content">
            <h3>${title}</h3>
            ${flagUrl ? `<img src="${flagUrl}" alt="Flag of ${title}" class="explore-flag">` : ''}
            <div class="explore-details">
                <p><strong>Capital:</strong> ${capital}</p>
                <p><strong>Population:</strong> ${population}</p>
            </div>
            <button class="btn-close">Close</button>
        </div>
    `;

    let popup = document.getElementById('explore-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'explore-popup';
        popup.className = 'explore-popup';
        document.body.appendChild(popup);
        // Close on outside click
        popup.addEventListener('click', (e) => {
            if (e.target === popup) closeCountryPopup();
        });
    }

    popup.innerHTML = popupHtml;
    popup.style.display = 'block';

    // Add close button handler
    popup.querySelector('.btn-close').addEventListener('click', closeCountryPopup);

    // Close on Escape key
    const closeOnEscape = (e) => {
        if (e.key === 'Escape') {
            closeCountryPopup();
            document.removeEventListener('keydown', closeOnEscape);
        }
    };
    document.addEventListener('keydown', closeOnEscape);
}

// Close country popup
function closeCountryPopup() {
    const popup = document.getElementById('explore-popup');
    if (popup) {
        popup.style.display = 'none';
    }
}

// ==================== COUNTRY SHAPE ID MODE ====================

// Shape descriptors used to offer Shape-ID distractors that LOOK like the target.
// Built once from the loaded (10m) geometry and cached until new map data loads.
let shapeDescriptorCache = null;

// Size / elongation / compactness descriptor for a country feature.
function computeShapeDescriptor(f) {
    const area = d3.geoArea(f); // steradians (spherical area, 0..4π)
    const [[w, s], [e, n]] = d3.geoBounds(f);
    let lonSpan = e - w;
    if (lonSpan < 0) lonSpan += 360; // antimeridian wrap
    const midLat = (s + n) / 2;
    const width = lonSpan * Math.cos(midLat * Math.PI / 180); // physical width (deg-equiv)
    const height = Math.max(n - s, 1e-3);
    const aspect = width / height;                            // >1 wide, <1 tall
    // Spherical bounding-box area, for a size-independent compactness ratio.
    const bboxArea = Math.abs((lonSpan * Math.PI / 180) *
        (Math.sin(n * Math.PI / 180) - Math.sin(s * Math.PI / 180)));
    const compactness = bboxArea > 0 ? area / bboxArea : 0;   // fraction of bbox filled
    return { logArea: Math.log(Math.max(area, 1e-6)), logAspect: Math.log(Math.max(aspect, 1e-3)), compactness };
}

// name -> shape descriptor, from the largest feature per name (some names split
// into micro-polygons at high detail; the biggest carries the recognisable shape).
function buildShapeDescriptorCache() {
    const byName = new Map();
    (gameState.countries || []).forEach(f => {
        const nm = f && f.properties && f.properties.name;
        if (!nm || (f.properties && f.properties.isTerritory)) return; // territories aren't quiz answers
        const prev = byName.get(nm);
        if (!prev || d3.geoArea(f) > d3.geoArea(prev)) byName.set(nm, f);
    });
    const cache = new Map();
    byName.forEach((f, nm) => cache.set(nm, computeShapeDescriptor(f)));
    return cache;
}

function getShapeDescriptorCache() {
    if (!shapeDescriptorCache) shapeDescriptorCache = buildShapeDescriptorCache();
    return shapeDescriptorCache;
}

// The `count` quiz-list countries whose overall shape is most similar to the
// target's, by standardized (z-scored) distance in descriptor space.
function shapeSimilarNames(targetName, count) {
    const cache = getShapeDescriptorCache();
    const list = (gameState.currentQuizList || []).filter(n => cache.has(n));
    const target = cache.get(targetName);
    if (!target || list.length < 2) return [];

    const keys = ['logArea', 'logAspect', 'compactness'];
    // The silhouette is fitted to fill the view, so absolute SIZE barely affects how
    // alike two outlines look — weight form (aspect, compactness) far above area.
    const weight = { logArea: 0.35, logAspect: 1.0, compactness: 1.0 };
    // Standardize each dimension so no single feature (e.g. huge log-area range) dominates.
    const stats = {};
    keys.forEach(k => {
        const vals = list.map(n => cache.get(n)[k]);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
        stats[k] = { mean, sd: Math.sqrt(variance) || 1 };
    });
    // Weighted Euclidean distance target→candidate in standardized (z-score) space.
    const dist = (d) => Math.hypot(...keys.map(k => weight[k] * (d[k] - target[k]) / stats[k].sd));

    return list
        .filter(n => n !== targetName)
        .map(n => ({ name: n, d: dist(cache.get(n)) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, count)
        .map(x => x.name);
}

// Build the 4 Shape-ID options: the answer + 2 shape-similar distractors + fill.
function generateShapeIdOptions(correctAnswer) {
    const list = gameState.currentQuizList || [];
    const options = [correctAnswer];
    shapeSimilarNames(correctAnswer, 2).forEach(n => { if (!options.includes(n)) options.push(n); });
    // Top up to 4 with random quiz items if similarity yielded too few.
    let guard = 0;
    while (options.length < 4 && options.length < list.length && guard++ < 500) {
        const r = list[Math.floor(Math.random() * list.length)];
        if (!options.includes(r)) options.push(r);
    }
    return shuffleArray(options);
}

// Render country shape ID question — show ONLY the target country's outline as a
// flat Mercator silhouette (no globe, neighbours, lakes or dots), then pick the name.
function renderCountryShapeIdQuestion() {
    gameState.questionType = 'country-shape-id';

    document.getElementById('question-text').innerHTML = `Which country is highlighted?`;
    const flagDisplay = document.getElementById('flag-display');
    if (flagDisplay) flagDisplay.style.display = 'none';

    // Locate the target feature (tolerant of accented atlas names).
    const target = (gameState.countries || []).find(
        f => f && f.properties && namesMatch(f.properties.name, gameState.targetCountry)
    );

    // Fit the Mercator projection to just this country. Rotate to its centroid
    // longitude first so shapes that straddle the antimeridian stay intact.
    if (target && projection && projection.fitExtent) {
        const c = d3.geoCentroid(target);
        if (c && isFinite(c[0])) projection.rotate([-c[0], 0]);
        const pad = Math.min(width, height) * 0.12;
        projection.fitExtent([[pad, pad], [width - pad, height - pad]], target);
    }

    // Draw ONLY the target as a single borderless silhouette. Rendering the whole
    // 10m world (~250k vertices) just to show one country is far too heavy, so the
    // other features are never added to the DOM (drawCountries skips them).
    countriesGroup.selectAll('path').remove();
    if (target) {
        countriesGroup.append('path')
            .datum(target)
            .attr('class', 'country shape-target')
            .attr('d', path);
    }

    // Multiple-choice options: the answer plus 2 distractors chosen for LOOKING like
    // the target shape (+ a random fill), so the wrong answers are genuinely tricky.
    const options = generateShapeIdOptions(gameState.targetCountry);
    renderMultipleChoice(options, gameState.targetCountry);
}

// ==================== SKYLINE ID MODE ====================

// Photos come from Wikimedia Commons: its API is CORS-open (origin=*) and every file
// carries machine-readable licensing, so the pool can be restricted to images we are
// actually allowed to show, and each one credited.
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
// Obvious non-photographs that a text search still surfaces.
const SKYLINE_REJECT_TITLE = /\b(map|flag|coat of arms|seal|logo|diagram|chart|plan|locator|poster|stamp|coin|banner|icon)\b/i;
// Titles promising an actual wide city view — used to RANK, never to reject.
const SKYLINE_GOOD_TITLE = /skyline|panorama|cityscape|downtown|aerial/i;

const skylineListCache = {};      // city → Promise<candidate[]>
const skylineNoPhoto = new Set(); // cities Commons had nothing usable for (don't re-query all game)
let skylineToken = 0;             // voids in-flight searches when the question moves on
let skylineNext = null;           // { city, photo } resolved ahead of time for the next round
let skylinePrefetching = false;

function commonsMeta(meta, key) {
    return (meta && meta[key] && meta[key].value) ? String(meta[key].value) : '';
}

// extmetadata values are HTML fragments (Artist is typically a link). DOMParser builds an
// INERT document, so unlike innerHTML this can't run scripts or fire loaders on remote markup.
function stripHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

// Accept public domain / CC0 (no obligations) and CC-BY / CC-BY-SA (credited under the
// photo). Everything else — NonCommercial, NoDerivatives, fair use, unrecognised — is
// dropped rather than guessed at.
function skylineLicenceOk(meta) {
    const s = (commonsMeta(meta, 'License') || commonsMeta(meta, 'LicenseShortName')).toLowerCase();
    if (!s) return false;
    if (/\bnc\b|noncommercial|\bnd\b|noderiv|fair use/.test(s)) return false;
    return /^(cc0|pd|public domain|cc[ -]by)/.test(s);
}

function commonsSearch(query) {
    const params = new URLSearchParams({
        action: 'query', format: 'json', origin: '*',
        generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '40',
        prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280',
        iiextmetadatafilter: 'License|LicenseShortName|Artist'
    });
    return fetch(COMMONS_API + '?' + params).then(r => {
        if (!r.ok) throw new Error('Commons search ' + r.status);
        return r.json();
    });
}

// Turn a Commons search response into ranked, usable skyline photos.
function skylineCandidates(json, city) {
    const pages = (json && json.query && json.query.pages) || {};
    const key = normalizeName(city);
    return Object.keys(pages).map(id => {
        const page = pages[id];
        const ii = page.imageinfo && page.imageinfo[0];
        if (!ii) return null;
        if (!/^image\/(jpeg|png|webp)$/.test(ii.mime || '')) return null;  // no SVG/PDF/video
        if (!(ii.width >= 900 && ii.width > ii.height)) return null;       // a skyline is wide
        const title = String(page.title || '').replace(/^File:/, '').replace(/\.\w+$/, '');
        if (SKYLINE_REJECT_TITLE.test(title)) return null;
        if (!skylineLicenceOk(ii.extmetadata)) return null;
        return {
            url: ii.thumburl || ii.url,
            page: ii.descriptionurl,
            title: title,
            artist: stripHtml(commonsMeta(ii.extmetadata, 'Artist')) || 'Unknown photographer',
            licence: commonsMeta(ii.extmetadata, 'LicenseShortName') || commonsMeta(ii.extmetadata, 'License'),
            // Rank, don't reject: a title naming the city is a far safer bet than trusting
            // search relevance, but a good photo may still be titled "Manhattan at dusk".
            score: (normalizeName(title).includes(key) ? 2 : 0) + (SKYLINE_GOOD_TITLE.test(title) ? 1 : 0)
        };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
}

// Search terms for a city. The state/country disambiguator (taken from the display label)
// is NOT optional: '"Toledo" skyline' returns Toledo, SPAIN above Toledo, Ohio, and
// '"St. Petersburg" skyline' can land in Russia — either would caption a photo with the
// wrong city and mark a right answer wrong. Adding the term costs ~5% of the usable hits
// and fixes that. A city can override the whole query via a `query` field in the data.
function skylineQuery(city) {
    const d = (gameState.currentDataObj || {})[city] || {};
    if (d.query) return d.query;
    const label = d.label || city;
    const comma = label.indexOf(',');
    const where = comma > -1 ? label.slice(comma + 1).trim() : '';
    return '"' + city + '" ' + (where ? where + ' ' : '') + 'skyline';
}

// Usable photos for a city, cached per session. A failed fetch is evicted so a network
// blip can't permanently blank a city.
function fetchSkylineCandidates(city) {
    if (skylineListCache[city]) return skylineListCache[city];
    const p = commonsSearch(skylineQuery(city)).then(j => skylineCandidates(j, city).slice(0, 6));
    p.catch(() => { delete skylineListCache[city]; });
    skylineListCache[city] = p;
    return p;
}

// Find a city Commons actually has a usable photo for. Whether one exists is only knowable
// after searching, so a miss retries with another city — and is remembered, so a barren city
// isn't re-queried every round. The pick is reserved (added to usedCountries) before the
// search returns, so a prefetch and a live pick can never land on the same city.
async function resolveSkylineTarget() {
    const data = gameState.currentDataObj || {};
    for (let attempt = 0; attempt < 8; attempt++) {
        const pool = Object.keys(data).filter(
            c => !gameState.usedCountries.has(c) && !skylineNoPhoto.has(c));
        if (!pool.length) return null;
        const city = pool[Math.floor(Math.random() * pool.length)];
        gameState.usedCountries.add(city);
        const list = await fetchSkylineCandidates(city).catch(() => []);
        if (list.length) return { city: city, photo: list[Math.floor(Math.random() * list.length)] };
        skylineNoPhoto.add(city);
    }
    return null;
}

// Resolve the NEXT round in the background while the player is still reading this one. A
// Commons search takes 0.5–6 s — far too long to spend on a spinner between questions.
function prefetchNextSkyline() {
    if (skylineNext || skylinePrefetching) return;
    skylinePrefetching = true;
    resolveSkylineTarget()
        .then(r => { skylineNext = r; })
        .catch(() => { })
        .then(() => { skylinePrefetching = false; });
}

function skylineLabel(name) {
    const d = (gameState.currentDataObj || {})[name];
    return (d && d.label) || name;
}

// Lower = better distractor. Same country dominates (Dallas vs Houston vs Austin), then
// same region; within a tier, closeness in population — so a megacity is never offered
// against a suburb. Population is compared on a log scale because the list spans 200k–30M.
function skylineDistractorScore(name, me, data) {
    const d = data[name] || {};
    const lg = p => Math.log10(Math.max(p || 1, 1));
    let s = 0;
    if (d.country && d.country === me.country) s -= 1000;
    else if (d.region && d.region === me.region) s -= 500;
    return s + Math.abs(lg(d.population) - lg(me.population)) * 100;
}

// 4 options as display labels: the answer plus its 3 most confusable neighbours.
function generateSkylineOptions(correct) {
    const data = gameState.currentDataObj || {};
    const me = data[correct] || {};
    const ranked = Object.keys(data).filter(n => n !== correct)
        .sort((a, b) => skylineDistractorScore(a, me, data) - skylineDistractorScore(b, me, data));
    // Draw from the closest handful rather than strictly the top 3, so replaying a city
    // doesn't always serve the same three wrong answers.
    const picks = shuffleArray(ranked.slice(0, 8)).slice(0, 3);
    return shuffleArray([correct].concat(picks)).map(skylineLabel);
}

function setSkylineStatus(text) {
    const el = document.getElementById('skyline-status');
    if (!el) return;
    el.textContent = text || '';
    el.style.display = text ? '' : 'none';
}

function showSkylinePhoto(photo) {
    const img = document.getElementById('skyline-image');
    document.getElementById('skyline-display').style.display = 'block';
    document.getElementById('skyline-credit').style.display = 'none';
    img.style.display = 'none';
    setSkylineStatus('Loading photo…');
    img.onload = () => { img.style.display = ''; setSkylineStatus(''); };
    img.onerror = () => setSkylineStatus('That photo failed to load — press Next for another city.');
    img.src = photo.url;
}

// Credit appears only once the round is decided. It has to wait: the Commons file title
// almost always names the city, so showing it up front would hand over the answer.
function revealSkylineCredit() {
    const credit = document.getElementById('skyline-credit');
    const photo = gameState.skylinePhoto;
    if (!credit || !photo) return;
    const link = document.createElement('a');
    link.href = photo.page;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = photo.title;
    credit.textContent = '';
    credit.append(link, document.createTextNode(
        ' · ' + photo.artist + ' · ' + photo.licence + ' · via Wikimedia Commons'));
    credit.style.display = '';
}

// Render a Skyline ID question: find a real photo of some large city's skyline, show it,
// and offer 4 city names. No map is involved at any point.
async function renderSkylineQuestion() {
    gameState.questionType = 'skyline-id';

    // This mode short-circuits the shared startNewQuestion body (which needs a map), so the
    // per-question resets it would have run have to happen here.
    document.getElementById('map-container').classList.add('hidden');
    document.getElementById('world-quiz-layout').classList.add('hidden');
    document.getElementById('question-container').classList.remove('hidden');
    clearMultipleChoice();
    gameState.answeredCorrectly = false;
    gameState.guessedThisQuestion = false;
    const nextBtn = document.getElementById('next-btn');
    nextBtn.disabled = true;
    nextBtn.style.display = 'inline-block';
    nextBtn.textContent = 'Next Question';
    const giveUpBtn = document.getElementById('give-up-btn');
    giveUpBtn.style.display = 'inline-block';
    giveUpBtn.textContent = 'Give Up';
    const feedback = document.getElementById('feedback');
    feedback.textContent = '';
    feedback.className = 'feedback';

    if (gameState.currentQuestion > gameState.totalQuestions) { endGame(); return; }

    // Drop the previous round's answer up front, so that if no photo can be found the error
    // state can't be given-up on and reveal a stale city/credit.
    gameState.targetCountry = null;
    gameState.skylinePhoto = null;

    const token = ++skylineToken;
    document.getElementById('question-text').textContent = 'Which city is this?';
    document.getElementById('skyline-display').style.display = 'block';
    document.getElementById('skyline-image').style.display = 'none';
    document.getElementById('skyline-credit').style.display = 'none';

    // Usually the previous round already resolved this one in the background.
    let picked = skylineNext;
    skylineNext = null;
    if (!picked) {
        setSkylineStatus('Finding a skyline…');
        picked = await resolveSkylineTarget();
        if (token !== skylineToken) return;   // a newer question superseded this one
    }

    if (!picked) {
        setSkylineStatus('Couldn’t reach Wikimedia Commons for a skyline photo. ' +
            'Check your connection, then press Next to try another city.');
        nextBtn.disabled = false;
        return;
    }

    gameState.targetCountry = picked.city;
    gameState.skylinePhoto = picked.photo;
    // resolveSkylineTarget already reserved this, but re-assert it: a pick prefetched during
    // a PREVIOUS game was reserved in a usedCountries that the new game then cleared, so
    // without this the carried-over city could come up a second time in the same game.
    gameState.usedCountries.add(picked.city);

    document.getElementById('question-text').innerHTML =
        'Which city is this? <span style="font-size:0.8em;color:#888;">Read the skyline.</span>';
    showSkylinePhoto(picked.photo);
    renderMultipleChoice(generateSkylineOptions(picked.city), skylineLabel(picked.city));
    prefetchNextSkyline();
}

// ==================== POPULATION ORDERING MODE ====================

// Render population ordering mode
function renderOrderingMode() {
    const modeConfig = QUIZ_MODES[gameState.mode];
    const criteria = modeConfig.orderingCriteria; // 'population'

    // Hide map-related elements
    document.getElementById('map-container').classList.add('hidden');
    document.getElementById('world-quiz-layout').classList.add('hidden');

    // Show question container
    document.getElementById('question-container').classList.remove('hidden');

    // Select 5 random countries with population data
    const countriesWithData = gameState.currentQuizList.filter(country => {
        const data = gameState.currentDataObj[country];
        return data && data[criteria];
    });

    // Randomly select 5 countries
    const shuffled = shuffleArray([...countriesWithData]);
    const selectedCountries = shuffled.slice(0, 5);

    // Store the correct order (by population, descending)
    const correctOrder = [...selectedCountries].sort((a, b) => {
        const popA = gameState.currentDataObj[a][criteria];
        const popB = gameState.currentDataObj[b][criteria];
        return popB - popA; // Descending order
    });

    gameState.correctOrder = correctOrder;
    gameState.currentCountries = selectedCountries;

    // Create question text
    document.getElementById('question-text').innerHTML = `
        <strong>Drag to order these countries by population</strong><br>
        <small>(Highest to Lowest)</small>
    `;

    // Create ordering container
    let orderingContainer = document.getElementById('ordering-container');
    if (!orderingContainer) {
        orderingContainer = document.createElement('div');
        orderingContainer.id = 'ordering-container';
        orderingContainer.className = 'ordering-container';
        document.getElementById('question-container').appendChild(orderingContainer);
    }

    // Clear container
    orderingContainer.innerHTML = '';

    // Create draggable items with flag
    const items = selectedCountries.map(country => {
        const data = gameState.currentDataObj[country];
        const flagUrl = getFlagUrl(country);
        return {
            id: country,
            content: `
                <div class="country-bubble">
                    <img src="${flagUrl}" alt="${country}" class="bubble-flag">
                    <span class="bubble-name">${country}</span>
                </div>
            `,
            data: data
        };
    });

    // Initialize drag-to-reorder
    if (gameState.dragInstance) {
        gameState.dragInstance.items = items;
        gameState.dragInstance.render();
        gameState.dragInstance.attachEventListeners();
    } else {
        gameState.dragInstance = new DragToReorder(orderingContainer, items, {
            itemClass: 'draggable-item',
            dragClass: 'dragging',
            overClass: 'drag-over'
        });
    }

    // Update button states
    document.getElementById('next-btn').style.display = 'none';
    document.getElementById('give-up-btn').style.display = 'none';

    // Create submit button
    let submitBtn = document.getElementById('submit-order-btn');
    if (!submitBtn) {
        submitBtn = document.createElement('button');
        submitBtn.id = 'submit-order-btn';
        submitBtn.className = 'btn';
        submitBtn.textContent = 'Submit Answer';
        submitBtn.onclick = checkOrderingAnswer;
        document.getElementById('controls').appendChild(submitBtn);
    }
    submitBtn.style.display = 'inline-block';
    submitBtn.disabled = false;
}

// Check ordering answer
function checkOrderingAnswer() {
    const userOrder = gameState.dragInstance.getCurrentOrder();
    const correctOrder = gameState.correctOrder;

    // Calculate score using pair-wise comparison
    const score = calculatePairwiseScore(userOrder, correctOrder);

    // Update game score (convert percentage to points out of 10)
    const points = Math.round(score / 10);
    gameState.score += points;
    document.getElementById('score').textContent = gameState.score; syncScoreDisplay();

    // Show feedback
    const feedback = document.getElementById('feedback');

    // Display correct order with populations
    let correctOrderHTML = '<div class="correct-order"><strong>Correct Order:</strong><ol>';
    correctOrder.forEach(country => {
        const pop = gameState.currentDataObj[country].population;
        const formattedPop = pop.toLocaleString();
        correctOrderHTML += `<li>${country}: <strong>${formattedPop}</strong></li>`;
    });
    correctOrderHTML += '</ol></div>';

    if (score === 100) {
        feedback.innerHTML = `<div class="feedback correct">
            Perfect! 🎉 You got 100% of pairs in the correct order! (+${points} points)
        </div>${correctOrderHTML}`;
    } else if (score >= 70) {
        feedback.innerHTML = `<div class="feedback partial">
            Good! You got ${score}% of pairs in the correct order. (+${points} points)
        </div>${correctOrderHTML}`;
    } else {
        feedback.innerHTML = `<div class="feedback incorrect">
            You got ${score}% of pairs in the correct order. (+${points} points)
        </div>${correctOrderHTML}`;
    }

    // Disable submit button
    document.getElementById('submit-order-btn').disabled = true;

    // Show next button as a manual skip, then auto-advance after a pause. Advancing goes
    // through the shared goToNextQuestion() (via scheduleAutoAdvance/the Next button), which
    // already increments currentQuestion — this used to ALSO increment it here directly,
    // so every round advanced the counter by 2 and the game ended after half the rounds.
    document.getElementById('next-btn').style.display = 'inline-block';
    document.getElementById('next-btn').disabled = false;
    scheduleAutoAdvance();
}


// Centroid [lon, lat] for a quiz item: the polygon centroid when it exists,
// otherwise the island marker's capital coordinates (capitalCoords is [lat, lon]).
function getCountryCentroid(countryName) {
    const country = gameState.countries && gameState.countries.find(c => c.properties.name === countryName);
    if (country) return d3.geoCentroid(country);
    const data = (gameState.currentDataObj || {})[countryName];
    if (data && Array.isArray(data.capitalCoords)) return [data.capitalCoords[1], data.capitalCoords[0]];
    return null;
}

// Rotate globe to show target country
function rotateToCountry(countryName) {
    if (!isGlobeView()) return; // No rotation in flat (Mercator) view
    const centroid = getCountryCentroid(countryName);
    if (!centroid) return;

    d3.transition()
        .duration(1000)
        .tween('rotate', () => {
            const r = d3.interpolate(projection.rotate(), [-centroid[0], -centroid[1]]);
            return t => {
                projection.rotate(r(t));
                countriesGroup.selectAll('path').attr('d', path);
                updateIslandMarkers();
            };
        })
        .on('end', () => {
            r_unconstrained = projection.rotate().slice();
        });
}

// Zoom and rotate to show target country (for quiz feedback)
function zoomAndRotateToCountry(countryName, duration = 800) {
    if (!isGlobeView()) return Promise.resolve(); // No rotation in flat (Mercator) view
    const centroid = getCountryCentroid(countryName);
    if (!centroid) return Promise.resolve();

    const modeConfig = QUIZ_MODES[gameState.mode];

    return new Promise(resolve => {
        d3.transition()
            .duration(duration)
            .tween('zoom-rotate', () => {
                const r = d3.interpolate(projection.rotate(), [-centroid[0], -centroid[1]]);
                const s = d3.interpolate(projection.scale(), 400); // Zoom in a bit
                return t => {
                    projection.rotate(r(t));
                    projection.scale(s(t));
                    countriesGroup.selectAll('path').attr('d', path);
                    updateIslandMarkers();

                    // Update ocean circle for globe view
                    if (modeConfig.useGlobe) {
                        g.select('circle').attr('r', s(t));
                    }
                };
            })
            .on('end', () => {
                r_unconstrained = projection.rotate().slice();
                resolve();
            });
    });
}

// Enhanced drag functions for interactive rotations (versor-based)
let v0, r0, q0;
let r_unconstrained = null;  // Track unconstrained rotation for quaternion continuity
let gammaLocked = true;  // When true, gamma (tilt/roll) is locked to 0 (north-up). Default on so the globe stays upright.

function dragStart(event) {
    // Don't allow dragging if scrolling is locked
    if (gameState.scrollLocked) return;

    const p = d3.pointer(event, this);
    r0 = projection.rotate();
    v0 = versor.cartesian(projection.invert(p));
    q0 = versor(r_unconstrained || r0);
}

function dragging(event) {
    // Don't allow dragging if scrolling is locked
    if (gameState.scrollLocked) return;

    const p = d3.pointer(event, this);
    // Temporarily set rotation to r0 to compute inverse (for sticky rotation)
    projection.rotate(r0);
    const v1 = versor.cartesian(projection.invert(p));
    // Compute new rotation
    const q1 = versor.multiply(q0, versor.delta(v0, v1));
    const r1 = versor.rotation(q1);

    if (gammaLocked) {
        // North-up mode: keep gamma at 0 and clamp latitude so the globe can't flip.
        // Store the constrained rotation so the next drag stays north-up (no gamma drift).
        const constrainedLat = Math.max(-85, Math.min(85, r1[1]));
        const locked = [r1[0], constrainedLat, 0];
        projection.rotate(locked);
        r_unconstrained = locked;
    } else {
        // Free trackball: apply the full quaternion so the grabbed point follows
        // the cursor exactly and the globe tilts smoothly over the poles.
        projection.rotate(r1);
        r_unconstrained = r1;
    }
    countriesGroup.selectAll('path').attr('d', path);
    updateIslandMarkers();
}

function dragEnd() {
    // Drag ended, r_unconstrained is preserved for next drag
}

// Versor helper functions for proper spherical rotation
// Based on Fil's versor package (canonical D3 implementation)
function versor(e) {
    var l = e[0] / 2 * Math.PI / 180, sl = Math.sin(l), cl = Math.cos(l);
    var p = e[1] / 2 * Math.PI / 180, sp = Math.sin(p), cp = Math.cos(p);
    var g = e[2] / 2 * Math.PI / 180, sg = Math.sin(g), cg = Math.cos(g);
    return [
        cl * cp * cg + sl * sp * sg,
        sl * cp * cg - cl * sp * sg,
        cl * sp * cg + sl * cp * sg,
        cl * cp * sg - sl * sp * cg
    ];
}

versor.cartesian = function(e) {
    const lambda = e[0] * Math.PI / 180;
    const phi = e[1] * Math.PI / 180;
    const cosPhi = Math.cos(phi);
    return [cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi)];
};

versor.dot = function(a, b) {
    let sum = 0;
    for (let i = 0; i < 3; i++) sum += a[i] * b[i];
    return sum;
};

versor.cross = function(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
};

versor.delta = function(v0, v1) {
    var w = versor.cross(v0, v1), l = Math.sqrt(versor.dot(w, w));
    if (!l) return [1, 0, 0, 0];
    // A quaternion rotating by angle θ has components [cos(θ/2), axis·sin(θ/2)].
    // Use the half-angle so the grabbed point tracks the cursor 1:1 (canonical
    // Jason Davies / Fil versor dragging). The previous full-angle form rotated
    // by 2θ, which made the globe spin twice as fast and lurch over the poles.
    var t = Math.acos(Math.max(-1, Math.min(1, versor.dot(v0, v1)))) / 2;
    var s = Math.sin(t) / l;
    return [Math.cos(t), w[2] * s, -w[1] * s, w[0] * s];
};

versor.multiply = function(a, b) {
    return [
        a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
        a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
        a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
        a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
    ];
};

versor.rotation = function(q) {
    return [
        Math.atan2(2 * (q[0] * q[1] + q[2] * q[3]), 1 - 2 * (q[1] * q[1] + q[2] * q[2])) * 180 / Math.PI,
        Math.asin(Math.max(-1, Math.min(1, 2 * (q[0] * q[2] - q[3] * q[1])))) * 180 / Math.PI,
        Math.atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (q[2] * q[2] + q[3] * q[3])) * 180 / Math.PI
    ];
};

// End game
function endGame() {
    // Stop globe spinning
    stopGlobeSpin();

    const modeConfig = QUIZ_MODES[gameState.mode];

    // Distance-scored modes (Find the Capital, Where Is My Spaceship?).
    if (modeConfig.findCapitalMode || modeConfig.spaceshipMode) {
        document.getElementById('question-text').innerHTML = 'Game Over!';
        clearMultipleChoice();
        const unit = modeConfig.spaceshipMode ? 'locations' : 'capitals';
        const total = Math.round(gameState.totalDistanceKm || 0);
        const avg = Math.round((gameState.totalDistanceKm || 0) / gameState.totalQuestions);
        const feedback = document.getElementById('feedback');
        feedback.innerHTML = `Total distance: <strong>${total.toLocaleString()} km</strong> over ${gameState.totalQuestions} ${unit}<br>` +
            `Average: <strong>${avg.toLocaleString()} km</strong> per guess — ${capitalRating(avg)}`;
        feedback.className = 'feedback ' + (avg < 1000 ? 'correct' : 'incorrect');
        document.getElementById('next-btn').disabled = true;
        document.getElementById('give-up-btn').style.display = 'none';
        return;
    }

    const maxSub = maxSubForMode(modeConfig);
    const maxScore = gameState.totalQuestions * maxSub;
    const percentage = Math.round((gameState.score / maxScore) * 100);

    document.getElementById('question-text').innerHTML = 'Game Over!';
    clearMultipleChoice();

    const feedback = document.getElementById('feedback');
    feedback.textContent = `You scored ${gameState.score}/${maxScore} (${percentage}%)`;
    feedback.className = percentage >= 70 ? 'feedback correct' : 'feedback incorrect';

    document.getElementById('next-btn').disabled = true;
}

// Restart game
function restartGame() {
    const currentMode = gameState.mode;
    const currentDataObj = gameState.currentDataObj;
    const currentQuizList = gameState.currentQuizList;
    const countries = gameState.countries;
    const prevTotal = gameState.totalQuestions;

    gameState = {
        score: 0,
        currentQuestion: 1,
        totalQuestions: prevTotal,
        targetCountry: null,
        countries: countries, // Keep loaded map data
        answeredCorrectly: false,
        usedCountries: new Set(),
        questionType: null,
        currentAnswer: null,
        multipleChoiceOptions: [],
        subQuestionIndex: 0,
        maxSubQuestions: 3,
        mode: currentMode,
        currentDataObj: currentDataObj,
        currentQuizList: currentQuizList
    };

    document.getElementById('score').textContent = '0'; syncScoreDisplay();
    document.getElementById('current-question').textContent = '1';

    startNewQuestion();
}

// Go back to home/mode selector
function goHome() {
    d3.select('#globe').selectAll('*').remove();
    d3.select('#globe-world').selectAll('*').remove();

    // Clean up any in-progress mode state
    closeCountryPopup();
    stopNameAllTimer();
    removeSpaceshipInset();
    disposeOrbital();
    document.body.classList.remove('spaceship-active');
    document.querySelector('.container').classList.remove('globe-side-layout');

    document.getElementById('top-bar').style.display = 'none';
    document.getElementById('landing-header').style.display = '';

    document.getElementById('mode-selector').classList.remove('hidden');
    document.getElementById('states-selector').classList.add('hidden');
    document.getElementById('game-info').classList.add('hidden');
    document.getElementById('question-container').classList.add('hidden');
    document.getElementById('controls').classList.add('hidden');
    document.getElementById('multiple-choice-container').classList.add('hidden');
    document.getElementById('map-container').classList.add('hidden');
    document.getElementById('world-quiz-layout').classList.add('hidden');
    document.getElementById('world-quiz-question-bar').classList.add('hidden');

    // Always return to the top-level menu (not a leftover sub-selector) and scroll up.
    resetModeSelector();
    window.scrollTo(0, 0);
    document.getElementById('mode-selector').scrollTop = 0;
}

// Event listeners
function setupEventListeners() {
    // Mode selection from main mode selector
    document.querySelectorAll('#mode-selector .mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mode = e.currentTarget.dataset.mode;
            if (mode === 'find') {
                showFindModeSelector();
            } else if (mode === 'identify') {
                showIdentifyModeSelector();
            } else if (mode === 'name-all') {
                showNameAllModeSelector();
            } else {
                startGameWithMode(mode);
            }
        });
    });

    // States sub-mode selection
    document.querySelectorAll('#states-selector .mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mode = e.currentTarget.dataset.mode;
            startGameWithMode(mode);
        });
    });

    // Back button in states selector
    document.getElementById('back-to-modes-btn').addEventListener('click', () => {
        document.getElementById('states-selector').classList.add('hidden');
        document.getElementById('mode-selector').classList.remove('hidden');
    });

    // Home link in header — both the in-game top-bar title and the big landing-page
    // title/logo always take the user back to the mode selector.
    const homeLink = document.getElementById('home-link');
    if (homeLink) {
        homeLink.addEventListener('click', goHome);
    } else {
        console.error('home-link element not found');
    }
    const landingHeader = document.getElementById('landing-header');
    if (landingHeader) landingHeader.addEventListener('click', goHome);

    // All/Random-10 scope toggle (Find + Identify selector screens). Delegated on the
    // persistent #mode-selector container since showFindModeSelector/showIdentifyModeSelector
    // rewrite its innerHTML wholesale every time they're opened.
    const modeSelectorEl = document.getElementById('mode-selector');
    if (modeSelectorEl) {
        modeSelectorEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.scope-btn');
            if (!btn) return;
            const group = btn.closest('.scope-toggle');
            const isAll = btn.dataset.scope === 'all';
            if (group.dataset.for === 'find') findQuizScopeAll = isAll;
            else if (group.dataset.for === 'identify') identifyQuizScopeAll = isAll;
            group.querySelectorAll('.scope-btn').forEach(b => b.classList.toggle('active', b === btn));
        });
    }

    // Helper to switch modes from the top bar
    function switchToMode(mode) {
        d3.select('#globe').selectAll('*').remove();
        d3.select('#globe-world').selectAll('*').remove();
        document.getElementById('game-info').classList.add('hidden');
        document.getElementById('question-container').classList.add('hidden');
        document.getElementById('controls').classList.add('hidden');
        document.getElementById('multiple-choice-container').classList.add('hidden');
        document.getElementById('world-quiz-layout').classList.add('hidden');
        document.getElementById('world-quiz-question-bar').classList.add('hidden');
        startGameWithMode(mode);
    }

    // Top bar dropdown toggles
    function closeAllDropdowns() {
        document.querySelectorAll('.icon-dropdown').forEach(d => d.classList.remove('open'));
    }

    document.getElementById('find-mode-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = document.getElementById('find-dropdown');
        const wasOpen = dd.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) dd.classList.add('open');
    });

    document.getElementById('identify-mode-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = document.getElementById('identify-dropdown');
        const wasOpen = dd.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) dd.classList.add('open');
    });

    document.addEventListener('click', () => closeAllDropdowns());

    // Find dropdown items
    document.querySelectorAll('#find-dropdown .dropdown-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllDropdowns();
            switchToMode(e.currentTarget.dataset.mode);
        });
    });

    // Identify dropdown items
    document.querySelectorAll('#identify-dropdown .dropdown-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllDropdowns();
            const region = e.currentTarget.dataset.identifyRegion;
            d3.select('#globe').selectAll('*').remove();
            d3.select('#globe-world').selectAll('*').remove();
            startIdentifyMode(region);
        });
    });

    // Direct mode icon buttons (name-all, population-order, mystery-flag, capitals-race)
    document.querySelectorAll('.top-bar-modes > .mode-icon-btn[data-mode]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mode = e.currentTarget.dataset.mode;
            if (mode) switchToMode(mode);
        });
    });

    // Next button
    document.getElementById('next-btn').addEventListener('click', () => {
        const mc = QUIZ_MODES[gameState.mode];
        // In Find-the-Capital, this button submits the guess before advancing.
        if (mc && mc.findCapitalMode && !gameState.capitalSubmitted) {
            submitCapitalGuess();
            return;
        }
        if (mc && mc.spaceshipMode && !gameState.capitalSubmitted) {
            submitSpaceshipGuess();
            return;
        }
        // Move to next item (also cancels any pending auto-advance)
        goToNextQuestion();
    });

    // Give up button
    document.getElementById('give-up-btn').addEventListener('click', giveUp);

    // Restart button
    document.getElementById('restart-btn').addEventListener('click', restartGame);

    // Gamma lock toggle
    document.getElementById('gamma-lock-toggle').addEventListener('click', function() {
        gammaLocked = !gammaLocked;
        this.textContent = gammaLocked ? 'Tilt: Locked' : 'Tilt: Free';
        if (gammaLocked) {
            const r = projection.rotate();
            projection.rotate([r[0], r[1], 0]);
            r_unconstrained = [r[0], r[1], 0];
            countriesGroup.selectAll('path').attr('d', path);
            updateIslandMarkers();
        }
    });

    // Projection toggle (globe <-> flat Mercator)
    const projToggleBtn = document.getElementById('projection-toggle');
    if (projToggleBtn) projToggleBtn.addEventListener('click', toggleFlatGlobe);

    // Level-of-detail toggle (cycles low → medium → high) for world maps
    const detailBtn = document.getElementById('detail-toggle');
    if (detailBtn) detailBtn.addEventListener('click', function () {
        mapDetail = DETAIL_ORDER[(DETAIL_ORDER.indexOf(mapDetail) + 1) % DETAIL_ORDER.length];
        this.textContent = 'Detail: ' + mapDetail.charAt(0).toUpperCase() + mapDetail.slice(1);
        reloadWorldDetail();
    });

    // Orbit-height slider: re-aims the orbital camera (altitude → distance + default tilt).
    const orbitHeightSlider = document.getElementById('tune-orbit-height');
    if (orbitHeightSlider) {
        const label = document.getElementById('tune-orbit-height-val');
        orbitHeightSlider.addEventListener('input', function () {
            orbitAltitudeKm = +this.value;
            if (label) label.textContent = orbitAltitudeKm.toLocaleString() + ' km';
            if (orbCam) { orbCam.tilt = defaultOrbitTilt(); orbitalRender(); }
        });
    }

    // "500 m tiles" toggle: fetch NASA's full-res Blue Marble tiles live and stitch the visible
    // cap (not bundled with the app). Off = the lighter single-globe crop / local tiles.
    const hires500 = document.getElementById('tune-hires-500m');
    if (hires500) {
        hires500.addEventListener('change', function () {
            orbitalUse500m = this.checked;
            if (orbCam) orbitalRefreshCap([orbCam.lon, orbCam.lat]);
        });
    }

    // Atmosphere gradient: independent space/earth spread sliders, the linear/tangent
    // earth-side toggle, and the 5-stop editor.
    const atmoSpreadSpace = document.getElementById('tune-atmo-spread-space');
    if (atmoSpreadSpace) {
        const label = document.getElementById('tune-atmo-spread-space-val');
        atmoSpreadSpace.addEventListener('input', function () {
            atmoSpreadSpaceKm = +this.value;
            if (label) label.textContent = atmoSpreadSpaceKm + ' km';
            applyAtmoUniforms();
            orbitalRender();
        });
    }
    const atmoSpreadEarth = document.getElementById('tune-atmo-spread-earth');
    if (atmoSpreadEarth) {
        const label = document.getElementById('tune-atmo-spread-earth-val');
        atmoSpreadEarth.addEventListener('input', function () {
            atmoSpreadEarthKm = +this.value;
            if (label) label.textContent = atmoSpreadEarthKm + ' km';
            applyAtmoUniforms();
            orbitalRender();
        });
    }
    const atmoTangent = document.getElementById('tune-atmo-tan-earth');
    if (atmoTangent) {
        atmoTangent.addEventListener('change', function () {
            atmoEarthTangentFade = this.checked;
            applyAtmoUniforms();
            orbitalRender();
        });
    }
    buildAtmoEditor();

    // "Country outlines" hint button (spaceship only; shown/labelled in the mode setup).
    const hintBtn = document.getElementById('hint-outlines-toggle');
    if (hintBtn) {
        hintBtn.addEventListener('click', function () {
            setOrbitalHint(!orbitalHintOn);
            this.textContent = 'Outlines: ' + (orbitalHintOn ? 'On' : 'Off');
        });
    }

    // Orbital scoring-weight sliders.
    [
        ['tune-score-acc', 'tune-score-acc-val', v => { scoreAccuracyWeight = v; }, v => String(v)],
        ['tune-score-speed', 'tune-score-speed-val', v => { scoreSpeedWeight = v; }, v => String(v)],
        ['tune-score-pan', 'tune-score-pan-val', v => { scorePanWeight = v; }, v => v.toFixed(2)],
        ['tune-score-dist', 'tune-score-dist-val', v => { scoreDistScaleKm = v; }, v => v.toLocaleString() + ' km'],
        ['tune-score-time', 'tune-score-time-val', v => { scoreTimeScaleSec = v; }, v => v + ' s']
    ].forEach(([id, valId, setter, fmt]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const lab = document.getElementById(valId);
        el.addEventListener('input', function () { const v = +this.value; setter(v); if (lab) lab.textContent = fmt(v); });
    });

    // Site-wide answer-reveal/advance pause (every quiz mode).
    const answerPauseSlider = document.getElementById('tune-answer-pause');
    if (answerPauseSlider) {
        const label = document.getElementById('tune-answer-pause-val');
        answerPauseSlider.addEventListener('input', function () {
            ANSWER_PAUSE_MS = +this.value;
            if (label) label.textContent = this.value + ' ms';
        });
    }

    // Live tuning sliders (dot pixel threshold, dot spacing).
    const dotSizeSlider = document.getElementById('tune-dotsize');
    if (dotSizeSlider) {
        const label = document.getElementById('tune-dotsize-val');
        dotSizeSlider.addEventListener('input', function () {
            DOT_PIXEL_THRESHOLD = +this.value;
            if (label) label.textContent = this.value;
            updateIslandMarkers();
        });
    }
    const dotSpaceSlider = document.getElementById('tune-dotspace');
    if (dotSpaceSlider) {
        const label = document.getElementById('tune-dotspace-val');
        dotSpaceSlider.addEventListener('input', function () {
            DOT_SPACING = +this.value;
            if (label) label.textContent = this.value;
            updateIslandMarkers();
        });
    }
    // Settings pop-up: open/close the tuning-slider modal.
    const settingsBtn = document.getElementById('settings-btn');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsClose = document.getElementById('settings-close');
    if (settingsBtn && settingsOverlay) {
        const openSettings = () => settingsOverlay.classList.remove('hidden');
        const closeSettings = () => settingsOverlay.classList.add('hidden');
        settingsBtn.addEventListener('click', openSettings);
        if (settingsClose) settingsClose.addEventListener('click', closeSettings);
        // Close on backdrop click (but not when clicking inside the panel).
        settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) closeSettings(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSettings(); });
    }

    // Debug validity overlay toggle (button + 'd' keyboard shortcut)
    const debugBtn = document.getElementById('debug-validity-toggle');
    if (debugBtn) debugBtn.addEventListener('click', toggleDebugValidity);
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'd' && e.key !== 'D') return;
        // Ignore when typing into an input/textarea
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        toggleDebugValidity();
    });
}

// Show find mode selector (choose region)
// ==================== FIND THE CAPITAL ====================
// Show a capital name; the player clicks the world map to guess its location.
// Scored by total great-circle distance over all rounds (lower is better).
let capitalMarkersGroup = null;

function clearCapitalMarkers() {
    if (capitalMarkersGroup) { capitalMarkersGroup.remove(); capitalMarkersGroup = null; }
}

function ensureCapitalMarkersGroup() {
    if (!capitalMarkersGroup) capitalMarkersGroup = g.append('g').attr('class', 'capital-markers');
    return capitalMarkersGroup;
}

function renderFindCapitalQuestion() {
    gameState.questionType = 'capital-location';
    gameState.capitalSubmitted = false;
    gameState.currentGuess = null;
    if (gameState.totalDistanceKm == null) gameState.totalDistanceKm = 0;

    // Pick a country with known capital coordinates that hasn't been used yet.
    const pool = gameState.currentQuizList.filter(n => {
        const d = gameState.currentDataObj[n];
        return d && Array.isArray(d.capitalCoords);
    });
    let target = pool[Math.floor(Math.random() * pool.length)];
    let guard = 0;
    while (gameState.usedCountries.has(target) && gameState.usedCountries.size < pool.length && guard++ < 500) {
        target = pool[Math.floor(Math.random() * pool.length)];
    }
    gameState.usedCountries.add(target);
    gameState.targetCountry = target;
    const data = gameState.currentDataObj[target];
    gameState.capitalAnswer = [data.capitalCoords[1], data.capitalCoords[0]]; // [lon, lat]

    clearCapitalMarkers();

    const sameName = data.capital === target;
    document.getElementById('question-text').innerHTML =
        `Round ${gameState.currentQuestion}/${gameState.totalQuestions} — Where is <strong>${data.capital}</strong>${sameName ? '' : ` <span style="opacity:.75">(capital of ${target})</span>`}?` +
        ` &nbsp;Click the map, then Submit.` +
        `<br><span style="font-size:.85em;opacity:.8">Total distance so far: ${Math.round(gameState.totalDistanceKm).toLocaleString()} km</span>`;

    document.getElementById('multiple-choice-container').classList.add('hidden');
    document.getElementById('flag-display').style.display = 'none';

    const nextBtn = document.getElementById('next-btn');
    nextBtn.textContent = 'Submit Guess';
    nextBtn.disabled = true;
    nextBtn.style.display = 'inline-block';
    document.getElementById('give-up-btn').style.display = 'inline-block';
    document.getElementById('give-up-btn').textContent = 'Skip';
}

function handleCapitalGuessClick(event) {
    const mc = QUIZ_MODES[gameState.mode];
    if (!mc || !mc.findCapitalMode || gameState.capitalSubmitted) return;
    const p = d3.pointer(event, svg.node());
    const geo = projection.invert(p);
    if (!geo || isNaN(geo[0])) return;
    gameState.currentGuess = geo;
    const grp = ensureCapitalMarkersGroup();
    let m = grp.select('.guess-marker');
    if (m.empty()) m = grp.append('circle').attr('class', 'guess-marker').attr('r', 6);
    m.attr('cx', p[0]).attr('cy', p[1]);
    document.getElementById('next-btn').disabled = false;
}

function revealCapitalAnswer(extraLine) {
    const grp = ensureCapitalMarkersGroup();
    const ap = projection(gameState.capitalAnswer);
    if (gameState.currentGuess) {
        const gp = projection(gameState.currentGuess);
        grp.append('line').attr('class', 'guess-line')
            .attr('x1', gp[0]).attr('y1', gp[1]).attr('x2', ap[0]).attr('y2', ap[1]);
    }
    grp.append('circle').attr('class', 'answer-marker').attr('r', 6).attr('cx', ap[0]).attr('cy', ap[1]);

    const nextBtn = document.getElementById('next-btn');
    nextBtn.textContent = (gameState.currentQuestion >= gameState.totalQuestions) ? 'See Results' : 'Next';
    nextBtn.disabled = false;
    document.getElementById('give-up-btn').style.display = 'none';

    // Distance-scored — no discrete right/wrong to reveal, so a single pause after the
    // result is shown (matching a correct-answer's pacing) before auto-advancing. The
    // relabelled Next/See Results button above still works as a manual skip.
    scheduleAutoAdvance();
}

function submitCapitalGuess() {
    if (gameState.capitalSubmitted || !gameState.currentGuess) return;
    gameState.capitalSubmitted = true;
    const dKm = d3.geoDistance(gameState.currentGuess, gameState.capitalAnswer) * 6371;
    gameState.totalDistanceKm += dKm;

    const data = gameState.currentDataObj[gameState.targetCountry];
    const feedback = document.getElementById('feedback');
    feedback.innerHTML = `<strong>${data.capital}</strong> — your guess was <strong>${Math.round(dKm).toLocaleString()} km</strong> away.` +
        ` &nbsp;Total: ${Math.round(gameState.totalDistanceKm).toLocaleString()} km`;
    feedback.className = 'feedback ' + (dKm < 500 ? 'correct' : 'incorrect');

    if (dKm < 500) { gameState.score++; document.getElementById('score').textContent = gameState.score; syncScoreDisplay(); }
    revealCapitalAnswer();
}

function skipCapitalGuess() {
    if (gameState.capitalSubmitted) return;
    if (gameState.currentGuess) { submitCapitalGuess(); return; }
    gameState.capitalSubmitted = true;
    gameState.totalDistanceKm += 5000; // skip penalty
    const data = gameState.currentDataObj[gameState.targetCountry];
    const feedback = document.getElementById('feedback');
    feedback.innerHTML = `Skipped. <strong>${data.capital}</strong> is marked on the map (+5,000 km penalty).` +
        ` &nbsp;Total: ${Math.round(gameState.totalDistanceKm).toLocaleString()} km`;
    feedback.className = 'feedback incorrect';
    revealCapitalAnswer();
}

function capitalRating(avgKm) {
    if (avgKm < 300) return 'World-class! 🌍';
    if (avgKm < 800) return 'Great geography! 🧭';
    if (avgKm < 1500) return 'Solid effort 👍';
    if (avgKm < 3000) return 'Room to improve 🗺️';
    return 'Back to the atlas! 📚';
}

// ==================== WHERE IS MY SPACESHIP? ====================
// A photographic low-Earth-orbit view: a three.js textured sphere (NASA Blue Marble)
// seen through a perspective camera placed at ISS altitude over a random coastal
// sub-satellite point, looking obliquely toward the shore. The player drags to look
// around (heading/tilt about the fixed sub-point) then guesses the location by
// dropping a pin on a small inset world map. Scored by total great-circle distance.
let spaceshipInset = null;    // { svg, projection, markers, ... }
// three.js orbital renderer state — lazily created on the first spaceship round,
// reused across rounds, disposed when leaving the mode.
let orbital = null;            // { renderer, scene, camera, earth, atmosphere, stars, canvas }
let orbitalTexLow = null;      // cached THREE.Texture (2048 low-res base sphere)
let orbCam = null;             // current camera params { lat, lon, heading, tilt, roll, fov }
let orbDrag = null;            // pointer-drag state for look-around
let orbitalResizeBound = false;
let orbitAltitudeKm = 250;        // camera altitude — tunable via the Orbit-height slider
const SPACESHIP_FOV = 48;         // vertical field of view (degrees)
const EARTH_R_KM = 6371;
// Distance ratio (R+h)/R and the derived viewing geometry. The camera-nadir→horizon
// angle grows toward 90° as altitude drops, so the default tilt (which frames the
// curved limb in the upper third) and the pan clamp are both derived from altitude.
function orbitDistance() { return 1 + orbitAltitudeKm / EARTH_R_KM; }
function horizonAngleDeg() { return Math.asin(1 / orbitDistance()) * 180 / Math.PI; }
function defaultOrbitTilt() { return Math.min(82, Math.max(8, horizonAngleDeg() - SPACESHIP_FOV * 0.22)); }
function clampOrbitTilt(t) { const h = horizonAngleDeg(); return Math.max(h * 0.35, Math.min(h + 15, t)); }
const EARTH_TEX_LOW = 'data/textures/earth-bmng-2048.jpg';
// Full-res detail is a grid of 45° cap tiles (10800² each, full 500m res). Only the
// ~3×3 block under the sub-point is loaded per round — at ≤500 km only a ~22° cap is
// ever visible, so the far side is never textured.
const CAP_TILE_DEG = 45, CAP_GRID_COLS = 8, CAP_GRID_ROWS = 4;
const capTileCache = new Map(); // 'c{col}-r{row}' -> THREE.Texture; pruned to the current cap each round (each is ~467 MB VRAM)
const capTileUrl = (col, row) => `data/textures/earth-cap-c${col}-r${row}.jpg`;

// Fallback when the local high-res cap tiles aren't deployed (they're gitignored, so a static
// host like Netlify only ships the low-res base). Rather than texturing the whole sphere with
// an oversized globe image, we crop just the visible spherical cap straight out of a NASA Blue
// Marble equirectangular source and drape that crop on a partial-sphere mesh — full detail in
// view, texture always within the GPU ceiling. Default source is the single 21600×10800 globe;
// the "500 m tiles" opt-in stitches from the eight full-res 21600² tiles (the build script's).
const NASA_BMNG_DIR = 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/june';
const NASA_GLOBE_URLS = [ // tried in order — prefer 21600×10800, drop to 5400 if it won't decode
    `${NASA_BMNG_DIR}/world.200406.3x21600x10800.jpg`,
    `${NASA_BMNG_DIR}/world.200406.3x5400x2700.jpg`,
];
const NASA_500M_URL = t => `${NASA_BMNG_DIR}/world.200406.3x21600x21600.${t}.jpg`;
const NASA_500M_COLS = ['A', 'B', 'C', 'D'];            // 90° lon columns: A[-180,-90] … D[90,180]
const NASA_500M_ROWS = { '1': [0, 90], '2': [-90, 0] }; // row 1 = north, row 2 = south
const NASA_500M_PPD = 21600 / 90;                       // 240 px/deg — native 500 m detail
const CAP_TEX_MAX = 12000;                              // hard cap on the crop-canvas edge (memory guard)
let orbitalNasaFallback = false;   // local cap tiles confirmed missing → source from NASA instead
let orbitalTilesProbed = false;    // one-time local-tile availability check has run
let orbitalUse500m = false;        // opt-in: fetch NASA's full 500 m tiles live and stitch the cap
let orbitalCapToken = 0;           // bumped per cap build so stale async builds can bail
let orbitalGlobePromise = null;    // cached decode of the NASA equirectangular globe
const nasa500Cache = new Map();    // tileKey ('C1') -> Promise<Blob> for fetched 500 m tiles

// Orbital scoring weights (all exposed as sliders). Per round:
//   score = accuracyWeight·e^(-dKm/distScale) + speedWeight·e^(-sec/timeScale) − panWeight·panDeg
let scoreAccuracyWeight = 60;  // max points for a perfect-distance guess
let scoreSpeedWeight = 40;     // max points for an instant guess
let scorePanWeight = 0.15;     // points deducted per degree of look-around panning
let scoreDistScaleKm = 500;    // distance (km) at which accuracy points fall to ~37%
let scoreTimeScaleSec = 20;    // seconds at which speed points fall to ~37%

function removeSpaceshipInset() {
    const el = document.getElementById('spaceship-inset');
    if (el) el.remove();
    spaceshipInset = null;
}

// Is this [lon,lat] over land?
function spaceshipIsLand(pt) {
    return d3.geoContains({ type: 'FeatureCollection', features: gameState.countries }, pt);
}

// Pick a random point that has a coastline in view (both land and water nearby).
function pickCoastalTarget() {
    for (let i = 0; i < 300; i++) {
        const lon = Math.random() * 360 - 180;
        const lat = Math.random() * 125 - 55; // -55..70, skip the poles
        let land = 0, water = 0;
        for (let a = 0; a < 360; a += 60) {
            const dlon = 4 * Math.cos(a * Math.PI / 180) / Math.max(0.3, Math.cos(lat * Math.PI / 180));
            const dlat = 4 * Math.sin(a * Math.PI / 180);
            if (spaceshipIsLand([lon + dlon, lat + dlat])) land++; else water++;
        }
        if (land >= 1 && water >= 1) return [lon, lat];
    }
    return [0, 51]; // fallback: English Channel
}

function ensureSpaceshipInset() {
    if (spaceshipInset && document.getElementById('spaceship-inset')) return;
    const host = document.getElementById('globe').parentNode;
    host.style.position = host.style.position || 'relative';

    const div = document.createElement('div');
    div.id = 'spaceship-inset';
    host.appendChild(div);

    const W = 300, H = 165;
    const isvg = d3.select(div).append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('width', W).attr('height', H);

    const yMid = (mercatorY(FLAT_WORLD_NORTH) + mercatorY(FLAT_WORLD_SOUTH)) / 2;
    const scale = W / (2 * Math.PI);
    const iproj = d3.geoMercator().center([0, 0]).rotate([0, 0, 0]).scale(scale)
        .translate([W / 2, H / 2 + scale * yMid]);
    const ipath = d3.geoPath().projection(iproj);

    // Fixed ocean background; land + markers live in a zoomable/pannable group so the
    // player can scroll-zoom in for a more precise guess.
    isvg.append('rect').attr('width', W).attr('height', H).attr('class', 'inset-ocean');
    const zoomG = isvg.append('g').attr('class', 'inset-zoom');
    zoomG.append('g').selectAll('path').data(gameState.countries).enter()
        .append('path').attr('class', 'inset-land').attr('d', ipath);
    const markers = zoomG.append('g').attr('class', 'inset-markers');

    // Scroll to zoom, drag to pan. A plain tap (no drag) still drops the guess pin —
    // handled on the zoom 'end' event so d3-zoom's pointer capture doesn't swallow it.
    let moved = false;
    const zoom = d3.zoom().scaleExtent([1, 60]).translateExtent([[0, 0], [W, H]])
        .on('start', () => { moved = false; })
        .on('zoom', (event) => {
            if (event.sourceEvent && event.sourceEvent.type !== 'wheel') moved = true;
            const k = event.transform.k;
            zoomG.attr('transform', event.transform);
            zoomG.selectAll('circle').attr('r', 5 / k);
            zoomG.selectAll('.guess-line').attr('stroke-width', 1.5 / k);
        })
        .on('end', (event) => {
            const se = event.sourceEvent;
            if (!moved && se && /(up|end)$/.test(se.type)) handleSpaceshipGuessClick(se);
            moved = false;
        });
    isvg.call(zoom).on('dblclick.zoom', null);

    spaceshipInset = { svg: isvg, projection: iproj, markers, zoom };
}

function clearSpaceshipPins() {
    if (!spaceshipInset) return;
    spaceshipInset.markers.selectAll('*').remove();
    spaceshipInset.svg.call(spaceshipInset.zoom.transform, d3.zoomIdentity); // reset pan/zoom for the new round
}

// Surface normal (unit vector) for [lat,lon] on the textured sphere. Derived from
// three's SphereGeometry vertex/UV convention so that a camera placed along this
// normal looking at the centre frames exactly the (lat,lon) texel of the
// equirectangular Blue Marble texture (left edge = -180°, top row = +90°).
function surfaceNormal(lat, lon) {
    const T = window.THREE;
    const phi = (lon + 180) * Math.PI / 180;   // 0..2π around the equator
    const theta = (90 - lat) * Math.PI / 180;  // 0 at N pole .. π at S pole
    return new T.Vector3(
        -Math.cos(phi) * Math.sin(theta),
        Math.cos(theta),
        Math.sin(phi) * Math.sin(theta)
    );
}

// Heading (radians; 0 = toward north, +clockwise toward east) that faces the nearby
// land, so recognizable coastline/terrain fills the frame (facing open water would
// leave an empty sea). Samples a ring around the sub-point and aims toward the land side.
function computeCoastHeading(target) {
    const [lon, lat] = target;
    const cosLat = Math.max(0.3, Math.cos(lat * Math.PI / 180));
    let east = 0, north = 0;
    for (let a = 0; a < 360; a += 30) {
        const ar = a * Math.PI / 180;
        const dlon = 5 * Math.cos(ar) / cosLat;
        const dlat = 5 * Math.sin(ar);
        const w = spaceshipIsLand([lon + dlon, lat + dlat]) ? 1 : -1; // aim toward land
        east += w * Math.cos(ar);
        north += w * Math.sin(ar);
    }
    if (east === 0 && north === 0) return Math.random() * 2 * Math.PI;
    return Math.atan2(east, north); // forward = cosψ·north + sinψ·east
}

// Whether the GPU can hold a full-res cap tile (10800²). Mobile often caps at 8192/4096
// — those stay on the low-res base sphere.
function orbitalSupportsHiRes() {
    if (!orbital) return true;
    const gl = orbital.renderer.getContext();
    return gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 10800;
}

// The GPU's single-texture ceiling (MAX_TEXTURE_SIZE); crops are never sized above it.
function orbitalTexCeiling() {
    if (!orbital) return 8192;
    const gl = orbital.renderer.getContext();
    return gl.getParameter(gl.MAX_TEXTURE_SIZE) || 8192;
}

// Lon/lat rectangle covering the visible spherical cap (+margin) around the sub-point. Uses the
// 500 km worst-case cap radius; lon widens toward the poles as meridians converge. lon0/lon1 may
// fall outside [-180,180] — the crop helpers handle the antimeridian wrap.
function nasaCapRect(target) {
    const [lon, lat] = target;
    const r = capGroundRadiusDeg() + 4;
    const dLon = Math.min(180, r / Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    return { lon0: lon - dLon, lon1: lon + dLon,
             lat0: Math.max(-89.9, lat - r), lat1: Math.min(89.9, lat + r) };
}

// Destination canvas size for a cap crop: the source's native pixels for the rect, shrunk to
// fit both the GPU ceiling and our memory cap.
function capDestSize(rect, pxPerDeg) {
    const ceil = Math.min(orbitalTexCeiling(), CAP_TEX_MAX);
    const w = (rect.lon1 - rect.lon0) * pxPerDeg, h = (rect.lat1 - rect.lat0) * pxPerDeg;
    const s = Math.min(1, ceil / w, ceil / h);
    return { w: Math.max(16, Math.round(w * s)), h: Math.max(16, Math.round(h * s)) };
}

// Decode the NASA equirectangular globe once (prefer 21600×10800; fall back to 5400×2700 if the
// big one won't decode — e.g. mobile memory limits). Resolves to the HTMLImageElement.
function loadNasaGlobe() {
    if (orbitalGlobePromise) return orbitalGlobePromise;
    orbitalGlobePromise = new Promise((resolve, reject) => {
        let i = 0;
        const tryNext = () => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => (img.naturalWidth ? resolve(img) : img.onerror());
            img.onerror = () => (++i < NASA_GLOBE_URLS.length ? tryNext() : reject(new Error('NASA globe failed')));
            img.src = NASA_GLOBE_URLS[i];
        };
        tryNext();
    });
    return orbitalGlobePromise;
}

// Crop [lon0,lon1]×[lat0,lat1] out of an equirectangular globe image into a dw×dh canvas.
// Drawing three horizontal copies (−360/0/+360) covers antimeridian wrap; off-canvas ones clip.
function cropGlobeToCanvas(img, rect, dw, dh) {
    const cv = document.createElement('canvas'); cv.width = dw; cv.height = dh;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    const W = img.naturalWidth, H = img.naturalHeight;
    const sy = (90 - rect.lat1) / 180 * H, sh = (rect.lat1 - rect.lat0) / 180 * H;
    const sx0 = (rect.lon0 + 180) / 360 * W, sx1 = (rect.lon1 + 180) / 360 * W;
    const scale = dw / (sx1 - sx0);
    for (let k = -1; k <= 1; k++) ctx.drawImage(img, 0, sy, W, sh, (k * W - sx0) * scale, 0, W * scale, dh);
    return cv;
}

// Fetch (and cache) a full 500 m tile blob; a failed fetch is evicted so it can be retried.
function fetch500mTile(key) {
    if (nasa500Cache.has(key)) return nasa500Cache.get(key);
    const p = fetch(NASA_500M_URL(key)).then(r => { if (!r.ok) throw new Error('500 m ' + key + ' ' + r.status); return r.blob(); });
    p.catch(() => nasa500Cache.delete(key));
    nasa500Cache.set(key, p);
    return p;
}

// Which 500 m tiles the cap rect overlaps, plus the source-pixel sub-rect within each tile and
// where it lands in the dw×dh cap canvas. The ±360 sweep resolves antimeridian wrap.
function tilePieces500m(rect, dw, dh) {
    const lonSpan = rect.lon1 - rect.lon0, latSpan = rect.lat1 - rect.lat0, pieces = [];
    for (const p of [-360, 0, 360]) for (let i = 0; i < 4; i++) {
        const tLon0 = -180 + 90 * i;
        const oLon0 = Math.max(rect.lon0, tLon0 + p), oLon1 = Math.min(rect.lon1, tLon0 + 90 + p);
        if (oLon1 - oLon0 <= 1e-6) continue;
        for (const rk of Object.keys(NASA_500M_ROWS)) {
            const [tLat0, tLat1] = NASA_500M_ROWS[rk];
            const oLat0 = Math.max(rect.lat0, tLat0), oLat1 = Math.min(rect.lat1, tLat1);
            if (oLat1 - oLat0 <= 1e-6) continue;
            pieces.push({
                key: NASA_500M_COLS[i] + rk,
                sx: (oLon0 - (tLon0 + p)) * NASA_500M_PPD, sw: (oLon1 - oLon0) * NASA_500M_PPD,
                sy: (tLat1 - oLat1) * NASA_500M_PPD, sh: (oLat1 - oLat0) * NASA_500M_PPD,
                dx: (oLon0 - rect.lon0) / lonSpan * dw, dw: (oLon1 - oLon0) / lonSpan * dw,
                dy: (rect.lat1 - oLat1) / latSpan * dh, dh: (oLat1 - oLat0) / latSpan * dh,
            });
        }
    }
    return pieces;
}

// A partial-sphere mesh over a lon/lat rect at radius 1, textured by `texture`. Same UV/flip
// convention as the local cap tiles (canvas/JPEG top row = north), so it maps 1:1.
function makeRectMesh(T, rect, texture) {
    const geo = new T.SphereGeometry(1, 64, 64,
        (rect.lon0 + 180) * Math.PI / 180, (rect.lon1 - rect.lon0) * Math.PI / 180,
        (90 - rect.lat1) * Math.PI / 180, (rect.lat1 - rect.lat0) * Math.PI / 180);
    return new T.Mesh(geo, new T.MeshBasicMaterial({ map: texture }));
}

// Dispose the current cap mesh(es) and drape `canvas` over `rect` as the new one.
function setNasaCapMesh(rect, canvas) {
    if (!orbital) return;
    const T = window.THREE;
    orbital.capMeshes.forEach(m => { orbital.scene.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); });
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
    const mesh = makeRectMesh(T, rect, tex);
    orbital.scene.add(mesh);
    orbital.capMeshes = [mesh];
    orbitalRender();
}

// Build the visible cap by cropping it out of the single NASA globe image (default fallback).
function buildGlobeCap(target, token) {
    loadNasaGlobe().then(img => {
        if (token !== orbitalCapToken || !orbital) return;
        const rect = nasaCapRect(target);
        const { w, h } = capDestSize(rect, img.naturalWidth / 360);
        setNasaCapMesh(rect, cropGlobeToCanvas(img, rect, w, h));
    }).catch(() => { /* both globe URLs failed — the low-res base sphere still shows */ });
}

// Build the visible cap by fetching NASA's full 500 m tiles live and stitching the overlap.
// createImageBitmap decodes+crops+downscales each tile in one step so we never hold a 466 MP
// canvas. Throws on any failure so the caller can fall back to the lighter globe crop.
async function build500mCap(target, token) {
    const rect = nasaCapRect(target);
    const { w, h } = capDestSize(rect, NASA_500M_PPD);
    const pieces = tilePieces500m(rect, w, h);
    if (!pieces.length) throw new Error('no 500 m coverage');
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    await Promise.all(pieces.map(async pc => {
        const blob = await fetch500mTile(pc.key);
        const bmp = await createImageBitmap(blob, pc.sx, pc.sy, pc.sw, pc.sh,
            { resizeWidth: Math.max(1, Math.round(pc.dw)), resizeHeight: Math.max(1, Math.round(pc.dh)), resizeQuality: 'high' });
        if (token === orbitalCapToken) ctx.drawImage(bmp, pc.dx, pc.dy);
        if (bmp.close) bmp.close();
    }));
    if (token !== orbitalCapToken || !orbital) return;
    setNasaCapMesh(rect, cv);
}

// Build the fallback cap for `target` with whatever source is active. 500 m failures (network /
// decode limits) fall back to the globe crop. Bumps the token so earlier builds don't clobber.
function orbitalBuildNasaCap(target) {
    const token = ++orbitalCapToken;
    if (orbitalUse500m) build500mCap(target, token).catch(() => { if (token === orbitalCapToken) buildGlobeCap(target, token); });
    else buildGlobeCap(target, token);
}

// Pick the cap source for `target`: the app's local pre-sliced tiles, or a NASA crop when the
// user opted into 500 m or the local tiles turned out to be missing.
function orbitalRefreshCap(target) {
    if (!orbital) return;
    if (orbitalUse500m || orbitalNasaFallback) orbitalBuildNasaCap(target);
    else orbitalLoadCap(target);
}

// Local cap tiles aren't deployed → source the cap from NASA for the rest of the session.
function useNasaFallback() {
    if (!orbital || orbitalNasaFallback) return;
    orbitalNasaFallback = true;
    for (const [key, tex] of [...capTileCache]) { tex.dispose(); capTileCache.delete(key); } // drop failed local loads
    if (orbCam) orbitalRefreshCap([orbCam.lon, orbCam.lat]);
}

// One-time check: are the local high-res cap tiles actually deployed? They're gitignored, so a
// static host (Netlify) ships only the base — a HEAD 404 (or an SPA-style 200 that returns HTML)
// flips us to the NASA fallback. On re-entry, re-apply an already-known fallback.
function probeLocalTiles() {
    if (orbitalNasaFallback) { if (orbCam) orbitalRefreshCap([orbCam.lon, orbCam.lat]); return; }
    if (orbitalTilesProbed) return;
    orbitalTilesProbed = true;
    fetch(capTileUrl(0, 0), { method: 'HEAD' })
        .then(r => { if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image')) useNasaFallback(); })
        .catch(() => useNasaFallback());
}

// Load the low-res full-globe base texture (instant paint; covers the far side / gaps under the cap).
function loadEarthTextures() {
    const T = window.THREE;
    if (orbitalTexLow) return;
    orbitalTexLow = new T.TextureLoader().load(EARTH_TEX_LOW, (t) => {
        t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
        if (orbital) { orbital.earth.material.map = orbitalTexLow; orbital.earth.material.needsUpdate = true; }
        orbitalRender();
    }, undefined, () => useNasaFallback()); // base also missing → NASA supplies the cap
}

// Geographic bounds of a cap grid tile.
function capTileBounds(col, row) {
    const lon0 = -180 + CAP_TILE_DEG * col, lat1 = 90 - CAP_TILE_DEG * row;
    return { lon0, lon1: lon0 + CAP_TILE_DEG, lat0: lat1 - CAP_TILE_DEG, lat1 };
}

function gcDeg(a, b) { return d3.geoDistance(a, b) * 180 / Math.PI; } // great-circle degrees
// Visible ground-cap radius at the 500 km ceiling: acos(R/(R+h)).
function capGroundRadiusDeg() { return Math.acos(1 / (1 + 500 / EARTH_R_KM)) * 180 / Math.PI; }

// The cap tiles the visible ~22° cap actually reaches (only load what's on screen).
// The lon window widens toward the poles (meridians converge); rows clamp at the poles.
function capTilesForTarget(target) {
    const [lon, lat] = target;
    const rCap = capGroundRadiusDeg() + 4; // + margin so tile edges are covered
    const tc = Math.floor((lon + 180) / CAP_TILE_DEG);
    const tr = Math.floor((90 - lat) / CAP_TILE_DEG);
    const colHalf = Math.min(CAP_GRID_COLS >> 1,
        Math.ceil(rCap / (CAP_TILE_DEG * Math.max(0.2, Math.cos(lat * Math.PI / 180)))));
    const rowHalf = Math.ceil(rCap / CAP_TILE_DEG);
    const seen = new Set(), tiles = [];
    for (let dc = -colHalf; dc <= colHalf; dc++) for (let dr = -rowHalf; dr <= rowHalf; dr++) {
        const row = tr + dr;
        if (row < 0 || row >= CAP_GRID_ROWS) continue;
        const col = ((tc + dc) % CAP_GRID_COLS + CAP_GRID_COLS) % CAP_GRID_COLS;
        const key = col + ',' + row;
        if (seen.has(key)) continue;
        const b = capTileBounds(col, row);
        const nLat = Math.max(b.lat0, Math.min(b.lat1, lat));
        // nearest point in the tile rect to the sub-point, accounting for ±360 lon wrap
        const dMin = Math.min(...[lon, lon - 360, lon + 360].map(L =>
            gcDeg(target, [Math.max(b.lon0, Math.min(b.lon1, L)), nLat])));
        if (dMin <= rCap || (dc === 0 && dr === 0)) { seen.add(key); tiles.push({ col, row }); }
    }
    return tiles;
}

// Load (or reuse) a cap-tile texture; orbitalLoadCap prunes ones no longer visible.
function getCapTexture(T, col, row) {
    const key = `c${col}-r${row}`;
    if (capTileCache.has(key)) return capTileCache.get(key);
    const tex = new T.TextureLoader().load(capTileUrl(col, row), () => orbitalRender(),
        undefined, () => useNasaFallback()); // tile 404 (not deployed) → single NASA globe
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
    capTileCache.set(key, tex);
    return tex;
}

// A mesh covering one tile's lon/lat rect at radius 1 (base sphere sits just inside, so
// these full-res tiles always render in front — no z-fighting, no per-round parallax).
function makeCapMesh(T, col, row, texture) {
    const b = capTileBounds(col, row);
    const geo = new T.SphereGeometry(1, 48, 48,
        (b.lon0 + 180) * Math.PI / 180, CAP_TILE_DEG * Math.PI / 180,   // phiStart, phiLength (lon)
        (90 - b.lat1) * Math.PI / 180, CAP_TILE_DEG * Math.PI / 180);   // thetaStart, thetaLength (lat)
    return new T.Mesh(geo, new T.MeshBasicMaterial({ map: texture }));
}

// Build the full-res cap under the current sub-point (skipped where 10800 tiles won't
// fit the GPU — the low-res base still shows).
function orbitalLoadCap(target) {
    if (!orbital || orbitalNasaFallback || !orbitalSupportsHiRes()) return;
    const T = window.THREE;
    orbital.capMeshes.forEach(m => { orbital.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    orbital.capMeshes = [];
    const needed = new Set();
    capTilesForTarget(target).forEach(({ col, row }) => {
        needed.add(`c${col}-r${row}`);
        const mesh = makeCapMesh(T, col, row, getCapTexture(T, col, row));
        orbital.scene.add(mesh);
        orbital.capMeshes.push(mesh);
    });
    // Free VRAM from tiles no longer in view so only the current cap stays resident.
    for (const [key, tex] of [...capTileCache]) {
        if (!needed.has(key)) { tex.dispose(); capTileCache.delete(key); }
    }
    orbitalRender();
}

// ---- Atmosphere gradient -----------------------------------------------------------
// The gradient axis is a ray's TANGENT ALTITUDE — how high its closest approach to the
// planet centre sits above the surface. It is signed: positive while the ray still clears
// the limb (sky seen against space), negative once the ray cuts into the disc (ground).
// That single axis is what lets one gradient fade in BOTH directions away from the
// horizon. It is normalised to 0..1 as: 0 = uSpreadSpace above the limb, 0.5 = the limb
// itself, 1 = uSpreadEarth below it — the two sides scale INDEPENDENTLY (space capped at
// 600 km, earth at 1500 km), since the visible band is a much thinner optical effect above
// the limb than the haze/perspective fade a satellite photo shows across the ground. The
// space side always maps distance→position linearly; the earth side can instead warp
// through a tangent curve (uEarthTangent, a Settings checkbox) to compare the two shapes.
// Stop 2 ("Horizon") is pinned at exactly the limb (pos 0.5, undraggable) so there is
// always an explicit anchor colour right at the horizon line, independent of wherever the
// two flanking "Horizon (blue/white)" stops get dragged to. The editor keeps every other
// stop ascending and clamped to its neighbours (see setAtmoPos).
const ATMO_MIN_GAP = 0.01;           // min separation between stops (smoothstep needs edge0 < edge1)
let atmoSpreadSpaceKm = 120;         // space-side reach, capped at 600 km
let atmoSpreadEarthKm = 200;         // earth-side reach, capped at 1500 km
let atmoEarthTangentFade = false;    // false = linear earth-side fade, true = tangent-warped
let atmoStops = [
    { label: 'Space',           pos: 0.00, color: '#5b9dff', alpha: 0.00 },
    { label: 'Horizon (blue)',  pos: 0.32, color: '#4a90ff', alpha: 0.60 },
    { label: 'Horizon',         pos: 0.50, color: '#ffffff', alpha: 0.90, fixed: true },
    { label: 'Horizon (white)', pos: 0.66, color: '#eaf4ff', alpha: 0.52 },
    { label: 'Earth',           pos: 1.00, color: '#dceeff', alpha: 0.12 }
];

// '#rrggbb' → [r,g,b] in 0..1. Deliberately NOT via THREE.Color: colour management would
// convert the picked sRGB down to linear, but this shader writes straight to the sRGB
// framebuffer (a ShaderMaterial gets no output-conversion chunk unless it asks for one),
// so raw sRGB floats are what make the render match the swatch — and match the CSS preview.
function hexToRgb01(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16) || 0;
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// Atmosphere: a soft radial gradient anchored to the LIMB, fading both up into space and
// down across the earth's disc, with no hard shell edge.
//
// Blending is ADDITIVE, which is what lets one gradient serve both sides: against the black
// sky the blue stop reads as a limb glow, and over the lit disc the white stop reads as haze
// washing the ground out. Alpha is therefore intensity — additive maths is dst + rgb*alpha,
// so the 0-alpha stops at each end leave deep space and the ground genuinely untouched.
// (That formula is also exactly what CSS rgba() over black does, so the editor's preview
// strip is a true match rather than an approximation.)
//
// depthTest is off and renderOrder 1 so the shell composites over the earth rather than
// being occluded by it — the camera sits inside the shell, so its back faces cover every
// pixel and each fragment is shaded purely from its own ray direction.
function makeAtmosphere(T) {
    const n = atmoStops.length;
    const mat = new T.ShaderMaterial({
        transparent: true,
        blending: T.AdditiveBlending,
        side: T.BackSide,       // camera is inside the shell, so back faces cover the screen
        depthWrite: false,
        depthTest: false,       // glow must reach the disc, not stop at the earth's silhouette
        uniforms: {
            uSpreadSpace:  { value: atmoSpreadSpaceKm / EARTH_R_KM },  // space-side reach, Earth radii
            uSpreadEarth:  { value: atmoSpreadEarthKm / EARTH_R_KM },  // earth-side reach, Earth radii
            uEarthTangent: { value: atmoEarthTangentFade ? 1.0 : 0.0 },
            uPos: { value: atmoStops.map(s => s.pos) },
            uA:   { value: atmoStops.map(s => s.alpha) },
            uC:   { value: atmoStops.map(() => new T.Vector3()) }
        },
        vertexShader:
            'varying vec3 vWorld;' +
            'void main(){ vWorld = (modelMatrix * vec4(position,1.0)).xyz;' +
            ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
            'uniform float uSpreadSpace; uniform float uSpreadEarth; uniform float uEarthTangent;' +
            'uniform float uPos[' + n + ']; uniform float uA[' + n + ']; uniform vec3 uC[' + n + '];' +
            'varying vec3 vWorld;' +
            // tan(60°) and its reciprocal — the earth-side warp maps x∈[0,1] through
            // tan(x·60°)/tan(60°), a bounded convex curve (60°, not 90°, keeps tan finite).
            'const float TAN_K = 1.0471975512; const float INV_TAN_K = 0.5773502692;' +
            'void main(){' +
            ' vec3 ro = cameraPosition;' +
            ' vec3 rd = normalize(vWorld - ro);' +
            ' float tca = max(-dot(ro, rd), 0.0);' +
            ' float h = length(ro + rd * tca) - 1.0;' +   // signed tangent altitude (Earth radii)
            ' float p;' +
            ' if (h >= 0.0) {' +                          // space side: always LINEAR in distance
            '   float x = clamp(h / max(uSpreadSpace, 1e-5), 0.0, 1.0);' +
            '   p = 0.5 - x * 0.5;' +
            ' } else {' +                                  // earth side: linear, or tangent-warped
            '   float x = clamp(-h / max(uSpreadEarth, 1e-5), 0.0, 1.0);' +
            '   float xw = mix(x, tan(x * TAN_K) * INV_TAN_K, uEarthTangent);' +
            '   p = 0.5 + xw * 0.5;' +
            ' }' +
            // Chained mixes = an N-stop piecewise gradient: each smoothstep is fully 0 below
            // its own segment and fully 1 above it, so only the segment containing p blends.
            ' vec4 c = vec4(uC[0], uA[0]);' +
            ' for (int i = 1; i < ' + n + '; i++) {' +
            '   c = mix(c, vec4(uC[i], uA[i]), smoothstep(uPos[i - 1], uPos[i], p));' +
            ' }' +
            ' gl_FragColor = c; }'
    });
    // Large shell so every ray direction is covered; the fade completes long before the
    // shell's own silhouette, so there is no visible hard edge.
    const mesh = new T.Mesh(new T.SphereGeometry(2.5, 96, 96), mat);
    mesh.renderOrder = 1;   // draw last, over the earth and the outline hint
    return mesh;
}

// Push the current gradient state into the shader. Safe to call before the scene exists.
function applyAtmoUniforms() {
    if (!orbital || !orbital.atmosphere) return;
    const u = orbital.atmosphere.material.uniforms;
    u.uSpreadSpace.value = atmoSpreadSpaceKm / EARTH_R_KM;
    u.uSpreadEarth.value = atmoSpreadEarthKm / EARTH_R_KM;
    u.uEarthTangent.value = atmoEarthTangentFade ? 1.0 : 0.0;
    atmoStops.forEach((s, i) => {
        u.uPos.value[i] = s.pos;
        u.uA.value[i] = s.alpha;
        u.uC.value[i].fromArray(hexToRgb01(s.color));
    });
}

// ---- Atmosphere gradient editor (Settings ▸ Spaceship) ------------------------------

function atmoRgba(stop) {
    const [r, g, b] = hexToRgb01(stop.color).map(v => Math.round(v * 255));
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + stop.alpha + ')';
}

// Repaint the preview strip and re-place the handles/readouts from atmoStops.
function refreshAtmoEditor() {
    const preview = document.getElementById('atmo-preview');
    if (!preview) return;
    preview.style.background = 'linear-gradient(90deg, ' +
        atmoStops.map(s => atmoRgba(s) + ' ' + (s.pos * 100).toFixed(1) + '%').join(', ') + ')';
    document.querySelectorAll('#atmo-track .atmo-handle').forEach(h => {
        const s = atmoStops[+h.dataset.i];
        h.style.left = (s.pos * 100) + '%';
        h.style.background = s.color;   // opaque: a 0-alpha stop still needs a grabbable handle
        h.title = s.label + (s.fixed ? ' — fixed at the horizon' : ' — ' + Math.round(s.pos * 100) + '%');
    });
    document.querySelectorAll('#atmo-stops .atmo-stop-val').forEach(el => {
        el.textContent = Math.round(atmoStops[+el.dataset.i].alpha * 100) + '%';
    });
}

// Move stop i along the axis. Neighbours are held ATMO_MIN_GAP apart rather than merely
// kept in order, because smoothstep(edge0, edge1, x) is undefined when the edges coincide.
function setAtmoPos(i, pos) {
    if (atmoStops[i].fixed) return;   // the "Horizon" stop is pinned at the limb, not draggable
    const lo = i === 0 ? 0 : atmoStops[i - 1].pos + ATMO_MIN_GAP;
    const hi = i === atmoStops.length - 1 ? 1 : atmoStops[i + 1].pos - ATMO_MIN_GAP;
    atmoStops[i].pos = Math.min(Math.max(pos, Math.min(lo, hi)), Math.max(lo, hi));
    applyAtmoUniforms();
    refreshAtmoEditor();
    orbitalRender();
}

// Build the track handles and the per-stop colour/opacity rows (once, at startup).
function buildAtmoEditor() {
    const track = document.getElementById('atmo-track');
    const rows = document.getElementById('atmo-stops');
    if (!track || !rows) return;

    atmoStops.forEach((s, i) => {
        const handle = document.createElement('div');
        handle.className = 'atmo-handle' + (s.fixed ? ' fixed' : '');
        handle.dataset.i = i;
        track.appendChild(handle);
        // The "Horizon" stop is pinned at the limb — no drag handler at all, rather than one
        // that no-ops, so the cursor/behaviour honestly reflects that it can't be moved.
        if (!s.fixed) {
            handle.addEventListener('pointerdown', e => {
                e.preventDefault();
                handle.setPointerCapture(e.pointerId);   // keep tracking once the cursor leaves the track
                const move = ev => {
                    const r = track.getBoundingClientRect();
                    setAtmoPos(i, (ev.clientX - r.left) / (r.width || 1));
                };
                const up = () => {
                    handle.removeEventListener('pointermove', move);
                    handle.removeEventListener('pointerup', up);
                };
                handle.addEventListener('pointermove', move);
                handle.addEventListener('pointerup', up);
                move(e);
            });
        }

        const row = document.createElement('div');
        row.className = 'atmo-stop';

        const name = document.createElement('span');
        name.textContent = s.label;

        const colour = document.createElement('input');
        colour.type = 'color';
        colour.value = s.color;
        colour.title = s.label + ' colour';
        colour.addEventListener('input', () => {
            s.color = colour.value;
            applyAtmoUniforms(); refreshAtmoEditor(); orbitalRender();
        });

        const alpha = document.createElement('input');
        alpha.type = 'range';
        alpha.className = 'atmo-alpha';
        alpha.min = 0; alpha.max = 100; alpha.step = 1;
        alpha.value = Math.round(s.alpha * 100);
        alpha.title = s.label + ' opacity';
        alpha.addEventListener('input', () => {
            s.alpha = (+alpha.value) / 100;
            applyAtmoUniforms(); refreshAtmoEditor(); orbitalRender();
        });

        const val = document.createElement('span');
        val.className = 'atmo-stop-val';
        val.dataset.i = i;

        row.append(name, colour, alpha, val);
        rows.appendChild(row);
    });

    refreshAtmoEditor();
}

// A simple starfield on a large surrounding sphere.
function makeStarfield(T) {
    const N = 1500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
        const u = Math.random() * 2 - 1, t = Math.random() * 2 * Math.PI;
        const r = Math.sqrt(1 - u * u);
        pos[i * 3] = Math.cos(t) * r * 60;
        pos[i * 3 + 1] = u * 60;
        pos[i * 3 + 2] = Math.sin(t) * r * 60;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const mat = new T.PointsMaterial({ color: 0xffffff, size: 0.16, sizeAttenuation: true });
    return new T.Points(geo, mat);
}

let orbitalHintOn = false;      // spaceship country-outline hint (persists across rounds/re-entry)
let orbitalHintBuilding = false;
const HINT_RADIUS = 1.001;      // just barely above the surface (tiles at r=1) so outlines sit on the ground

// Flat [x,y,z, x,y,z, …] array of border-segment endpoint PAIRS on the sphere. Each map
// border segment is subdivided along its great circle so long spans keep hugging the
// surface (a straight chord would dip below it and be occluded). This layout feeds either a
// plain LineSegments BufferGeometry or a fat-line LineSegmentsGeometry.setPositions().
function buildCountryLinePositions(features, radius) {
    const positions = [];
    const slerp = (a, b, t) => {
        const d = Math.max(-1, Math.min(1, a.dot(b)));
        const th = Math.acos(d);
        if (th < 1e-6) return a.clone();
        const s = Math.sin(th);
        return a.clone().multiplyScalar(Math.sin((1 - t) * th) / s)
            .add(b.clone().multiplyScalar(Math.sin(t * th) / s));
    };
    const step = Math.PI / 180; // ~1° arc segments
    const addArc = (A, B) => {
        const n = Math.max(1, Math.ceil(A.angleTo(B) / step));
        let prev = A.clone().multiplyScalar(radius);
        for (let i = 1; i <= n; i++) {
            const v = (i === n ? B.clone() : slerp(A, B, i / n)).multiplyScalar(radius);
            positions.push(prev.x, prev.y, prev.z, v.x, v.y, v.z);
            prev = v;
        }
    };
    const addRing = (ring) => {
        for (let i = 0; i + 1 < ring.length; i++) {
            addArc(surfaceNormal(ring[i][1], ring[i][0]), surfaceNormal(ring[i + 1][1], ring[i + 1][0]));
        }
    };
    features.forEach(f => {
        const geom = f && f.geometry;
        if (!geom) return;
        if (geom.type === 'Polygon') geom.coordinates.forEach(addRing);
        else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly.forEach(addRing));
    });
    return positions;
}

// Country features at MEDIUM detail (50m, simplified with MEDIUM_SIMPLIFY_RETAIN) for the
// hint outlines — independent of the coarse 110m the spaceship loads for its map. Shares
// worldTopoCache so the 50m source is fetched at most once.
function loadHintFeatures() {
    const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';
    return fetchWorldTopo(url).then(data => {
        let topo = data;
        if (topojson.presimplify && topojson.quantile) {
            const pre = topojson.presimplify(data);
            topo = topojson.simplify(pre, topojson.quantile(pre, MEDIUM_SIMPLIFY_RETAIN));
        }
        return topojson.feature(topo, topo.objects.countries).features;
    });
}

// Fat lines size their px width against the renderer resolution — keep it in sync.
function syncHintResolution() {
    if (!orbital || !orbital.hintLines) return;
    const m = orbital.hintLines.material;
    if (m && m.resolution) {
        const sz = new window.THREE.Vector2();
        orbital.renderer.getSize(sz);
        m.resolution.set(sz.x || 1, sz.y || 1);
    }
}

// Lazily build the hint outline mesh from the 50m (medium) countries. Async (fetches the
// 50m source once); uses the fat-line addon for a slightly thicker stroke, falling back to
// 1px LineSegments if the addon didn't load.
function ensureHintLines() {
    if (!orbital || orbital.hintLines || orbitalHintBuilding) return;
    orbitalHintBuilding = true;
    loadHintFeatures().then(feats => {
        orbitalHintBuilding = false;
        if (!orbital || orbital.hintLines) return;
        const T = window.THREE, L = window.THREE_Lines;
        const positions = buildCountryLinePositions(feats, HINT_RADIUS);
        let lines;
        if (L && L.LineSegmentsGeometry) {
            const geo = new L.LineSegmentsGeometry();
            geo.setPositions(positions);
            const mat = new L.LineMaterial({
                color: 0xffffff, linewidth: 1.6, transparent: true, opacity: 0.85,
                depthTest: true, worldUnits: false
            });
            lines = new L.LineSegments2(geo, mat);
        } else {
            const geo = new T.BufferGeometry();
            geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
            const mat = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
            lines = new T.LineSegments(geo, mat);
        }
        lines.visible = orbitalHintOn;
        orbital.scene.add(lines);
        orbital.hintLines = lines;
        syncHintResolution();
        orbitalRender();
    }).catch(() => { orbitalHintBuilding = false; });
}

// Toggle the spaceship country-outline hint (builds the mesh on first use).
function setOrbitalHint(on) {
    orbitalHintOn = !!on;
    if (orbitalHintOn) ensureHintLines();
    if (orbital && orbital.hintLines) orbital.hintLines.visible = orbitalHintOn;
    orbitalRender();
}

// Create the three.js scene/renderer (idempotent — reused across rounds).
function ensureOrbital() {
    const T = window.THREE;
    if (!T) return null;
    if (orbital) { orbitalResize(); return orbital; }

    const host = document.getElementById('map-container');
    host.style.position = host.style.position || 'relative';
    const canvas = document.createElement('canvas');
    canvas.id = 'orbital-canvas';
    host.appendChild(canvas);

    const renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = T.SRGBColorSpace;

    const scene = new T.Scene();
    scene.background = new T.Color(0x05070d);
    const camera = new T.PerspectiveCamera(SPACESHIP_FOV, 1, 0.001, 100);

    // Low-res full-globe base sphere, slightly inside radius 1 so the full-res cap tiles
    // (at radius 1) always render in front of it; the base covers the far side / any gaps.
    const earth = new T.Mesh(new T.SphereGeometry(0.997, 96, 96), new T.MeshBasicMaterial({ map: orbitalTexLow }));
    scene.add(earth);
    const atmosphere = makeAtmosphere(T); scene.add(atmosphere);
    const stars = makeStarfield(T); scene.add(stars);

    orbital = { renderer, scene, camera, earth, atmosphere, stars, canvas, capMeshes: [] };
    applyAtmoUniforms(); // pick up any gradient edits made before the scene existed
    loadEarthTextures();
    if (orbitalTexLow && orbitalTexLow.image) { earth.material.map = orbitalTexLow; earth.material.needsUpdate = true; }
    probeLocalTiles(); // if the local cap tiles aren't deployed, switch to the NASA fallback
    attachOrbitalPan(canvas);
    if (!orbitalResizeBound) {
        window.addEventListener('resize', () => { if (orbital) orbitalResize(); });
        orbitalResizeBound = true;
    }
    orbitalResize();
    return orbital;
}

// True when the spaceship view should split into earth (top) + guess map (bottom):
// a narrow (mobile) viewport while the spaceship mode is active.
function orbitalMobileSplit() {
    return document.body.classList.contains('spaceship-active') &&
        window.matchMedia('(max-width: 768px)').matches;
}

// Match the renderer/camera to the container's on-screen size.
function orbitalResize() {
    if (!orbital) return;
    // Measure the CONTAINER, never the canvas. The canvas is an absolutely-positioned
    // replaced element, so reading its own clientWidth after setSize feeds the backing
    // store's size back in and multiplies by devicePixelRatio every call — a runaway
    // zoom across rounds. setSize(…, true) sets the canvas CSS size so it fills.
    const host = orbital.canvas.parentNode; // #map-container
    const cs = getComputedStyle(host);
    const w = Math.max(1, Math.round(host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
    let h = Math.max(1, Math.round(host.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)));
    // Mobile split-screen: the guess inset sits BELOW the earth view (full width), so
    // shrink the canvas to the space above it instead of letting the inset overlay it.
    if (orbitalMobileSplit()) {
        const inset = document.getElementById('spaceship-inset');
        if (inset && inset.offsetHeight) h = Math.max(1, h - inset.offsetHeight - 12);
    }
    orbital.renderer.setSize(w, h, true);
    orbital.camera.aspect = w / h;
    orbital.camera.updateProjectionMatrix();
    syncHintResolution(); // fat-line px width tracks the renderer size
    orbitalRender();
}

// Place/aim the camera from the current orbCam params (sub-point + heading/tilt/roll).
function applyOrbitalCamera() {
    if (!orbital || !orbCam) return;
    const T = window.THREE, cam = orbital.camera, c = orbCam;
    const n = surfaceNormal(c.lat, c.lon);
    cam.position.copy(n).multiplyScalar(orbitDistance());
    const east = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), n).normalize();
    const north = new T.Vector3().crossVectors(n, east).normalize();
    const tau = c.tilt * Math.PI / 180, psi = c.heading;
    const horiz = north.clone().multiplyScalar(Math.cos(psi)).add(east.clone().multiplyScalar(Math.sin(psi)));
    const fwd = n.clone().multiplyScalar(-Math.cos(tau)).add(horiz.multiplyScalar(Math.sin(tau))).normalize();
    const up = n.clone();
    if (c.roll) up.applyAxisAngle(fwd, c.roll * Math.PI / 180);
    cam.up.copy(up);
    cam.fov = c.fov; cam.updateProjectionMatrix();
    cam.lookAt(cam.position.clone().add(fwd));
    // The atmosphere needs no per-frame update: its gradient is anchored to tangent
    // altitude above the surface, so the band stays put as the orbit height changes.
}

function orbitalRender() {
    if (!orbital) return;
    // Show each cap tile only once its texture has decoded — an unloaded map renders
    // black, so until then the low-res base sphere shows through instead.
    orbital.capMeshes.forEach(m => { m.visible = !!(m.material.map && m.material.map.image); });
    applyOrbitalCamera();
    orbital.renderer.render(orbital.scene, orbital.camera);
}

// Set the camera for a new round's sub-satellite point (coast-facing heading).
function orbitalSetTarget(target) {
    orbCam = {
        lat: target[1], lon: target[0],
        heading: computeCoastHeading(target),
        tilt: defaultOrbitTilt(),
        roll: (Math.random() * 2 - 1) * 5,
        fov: SPACESHIP_FOV
    };
    orbitalRefreshCap(target); // local tiles, NASA globe crop, or 500 m stitch — whichever is active
    if (orbitalHintOn) ensureHintLines(); // (re)build the outline hint if it's on and countries are now loaded
    orbitalRender();
}

// Drag (and touch, via pointer events) to look around the fixed sub-point. Grab-style:
// the point under the cursor sticks to it (drag right → terrain follows right), with
// per-pixel angular sensitivity derived from the FOV so it tracks 1:1. Total panning is
// accumulated in gameState.roundPanDeg so scoring can penalise it.
function attachOrbitalPan(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
        orbDrag = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
        if (!orbDrag || !orbCam) return;
        const dx = e.clientX - orbDrag.x, dy = e.clientY - orbDrag.y;
        orbDrag.x = e.clientX; orbDrag.y = e.clientY;
        const w = orbital.canvas.clientWidth || 1, h = orbital.canvas.clientHeight || 1;
        const vfov = orbCam.fov;                                   // vertical FOV (deg)
        const hfov = 2 * Math.atan(Math.tan(vfov * Math.PI / 360) * orbital.camera.aspect) * 180 / Math.PI;
        const dHeadingDeg = -dx * (hfov / w); // grab: drag right → gaze left → terrain follows right
        const dTiltDeg = dy * (vfov / h);     // grab: drag down → gaze up → terrain follows down
        orbCam.heading += dHeadingDeg * Math.PI / 180;
        const beforeTilt = orbCam.tilt;
        orbCam.tilt = clampOrbitTilt(orbCam.tilt + dTiltDeg);
        if (gameState.roundPanDeg != null) {
            gameState.roundPanDeg += Math.abs(dHeadingDeg) + Math.abs(orbCam.tilt - beforeTilt);
        }
        orbitalRender();
    });
    const end = (e) => {
        orbDrag = null;
        if (e.pointerId != null && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
            canvas.releasePointerCapture(e.pointerId);
        }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
}

// Tear down the WebGL canvas/context (textures stay cached for fast re-entry).
function disposeOrbital() {
    if (!orbital) return;
    try {
        orbital.earth.geometry.dispose();
        orbital.earth.material.dispose();
        orbital.capMeshes.forEach(m => { m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); });
        capTileCache.forEach(t => t.dispose()); capTileCache.clear();
        orbital.atmosphere.geometry.dispose();
        orbital.atmosphere.material.dispose();
        if (orbital.hintLines) { orbital.hintLines.geometry.dispose(); orbital.hintLines.material.dispose(); }
        orbital.stars.geometry.dispose();
        orbital.stars.material.dispose();
        orbital.renderer.dispose();
    } catch (e) { /* best-effort cleanup */ }
    if (orbital.canvas && orbital.canvas.parentNode) orbital.canvas.parentNode.removeChild(orbital.canvas);
    orbital = null; orbCam = null; orbDrag = null;
    const globeEl = document.getElementById('globe'); // restore the SVG we hid for the orbital view
    if (globeEl) globeEl.style.display = '';
}

// Run fn now if three.js is ready, else once it loads (it's loaded lazily as a module).
function withThree(fn) {
    if (window.THREE) { fn(); return; }
    const h = () => { window.removeEventListener('three-ready', h); fn(); };
    window.addEventListener('three-ready', h);
}

// Render the current orbital target through the three.js camera/sphere.
function drawSpaceshipView() {
    if (!gameState.spaceshipTarget) return;
    // Hide the underlying D3 globe SVG so it can't peek through the mobile split gap
    // (the WebGL canvas + inset map cover the area instead). Restored in disposeOrbital.
    const globeEl = document.getElementById('globe');
    if (globeEl) globeEl.style.display = 'none';
    withThree(() => {
        if (!ensureOrbital()) return;
        orbitalSetTarget(gameState.spaceshipTarget);
        requestAnimationFrame(orbitalResize); // correct size once layout settles
    });
}

function renderSpaceshipQuestion() {
    gameState.questionType = 'spaceship';
    gameState.capitalSubmitted = false; // reuse the distance-mode "submitted" flag
    gameState.currentGuess = null;
    if (gameState.totalDistanceKm == null) gameState.totalDistanceKm = 0;

    gameState.spaceshipTarget = pickCoastalTarget(); // [lon, lat]
    gameState.roundStartTime = performance.now(); // for the speed score
    gameState.roundPanDeg = 0;                    // accumulated by the pan handler for the panning penalty

    gameState.scrollLocked = true; // freeze the globe (drag/zoom honor scrollLocked)
    drawSpaceshipView();           // renders the current target in the active renderer

    document.getElementById('question-text').innerHTML =
        `🛰️ Round ${gameState.currentQuestion}/${gameState.totalQuestions} — Where is your spaceship looking down? &nbsp;Drop a pin on the inset map, then Submit.` +
        `<br><span style="font-size:.85em;opacity:.8">Total distance so far: ${Math.round(gameState.totalDistanceKm).toLocaleString()} km</span>`;
    document.getElementById('multiple-choice-container').classList.add('hidden');
    document.getElementById('flag-display').style.display = 'none';

    ensureSpaceshipInset();
    clearSpaceshipPins();

    const nextBtn = document.getElementById('next-btn');
    nextBtn.textContent = 'Submit Guess';
    nextBtn.disabled = true;
    nextBtn.style.display = 'inline-block';
    document.getElementById('give-up-btn').style.display = 'inline-block';
    document.getElementById('give-up-btn').textContent = 'Skip';
}

function handleSpaceshipGuessClick(event) {
    const mc = QUIZ_MODES[gameState.mode];
    if (!mc || !mc.spaceshipMode || gameState.capitalSubmitted || !spaceshipInset) return;
    const p = d3.pointer(event, spaceshipInset.svg.node());
    const t = d3.zoomTransform(spaceshipInset.svg.node());
    const up = t.invert(p); // undo pan/zoom → base-projection coords (markers live in the zoom group)
    const geo = spaceshipInset.projection.invert(up);
    if (!geo || isNaN(geo[0])) return;
    gameState.currentGuess = geo;
    let m = spaceshipInset.markers.select('.guess-marker');
    if (m.empty()) m = spaceshipInset.markers.append('circle').attr('class', 'guess-marker');
    m.attr('cx', up[0]).attr('cy', up[1]).attr('r', 5 / t.k);
    document.getElementById('next-btn').disabled = false;
}

function revealSpaceshipAnswer() {
    if (!spaceshipInset) return;
    const k = d3.zoomTransform(spaceshipInset.svg.node()).k || 1;
    const ap = spaceshipInset.projection(gameState.spaceshipTarget);
    if (gameState.currentGuess) {
        const gp = spaceshipInset.projection(gameState.currentGuess);
        spaceshipInset.markers.append('line').attr('class', 'guess-line')
            .attr('x1', gp[0]).attr('y1', gp[1]).attr('x2', ap[0]).attr('y2', ap[1])
            .attr('stroke-width', 1.5 / k);
    }
    spaceshipInset.markers.append('circle').attr('class', 'answer-marker').attr('r', 5 / k)
        .attr('cx', ap[0]).attr('cy', ap[1]);
    const nextBtn = document.getElementById('next-btn');
    nextBtn.textContent = (gameState.currentQuestion >= gameState.totalQuestions) ? 'See Results' : 'Next';
    nextBtn.disabled = false;
    document.getElementById('give-up-btn').style.display = 'none';

    // Distance-scored — no discrete right/wrong to reveal, so a single pause after the
    // result is shown (matching a correct-answer's pacing) before auto-advancing. The
    // relabelled Next/See Results button above still works as a manual skip.
    scheduleAutoAdvance();
}

function submitSpaceshipGuess() {
    if (gameState.capitalSubmitted || !gameState.currentGuess) return;
    gameState.capitalSubmitted = true;
    const dKm = d3.geoDistance(gameState.currentGuess, gameState.spaceshipTarget) * 6371;
    gameState.totalDistanceKm += dKm;

    // Score = accuracy + speed − panning (weights are slider-tunable).
    const elapsedSec = (performance.now() - (gameState.roundStartTime || performance.now())) / 1000;
    const panDeg = gameState.roundPanDeg || 0;
    const accPts = scoreAccuracyWeight * Math.exp(-dKm / scoreDistScaleKm);
    const spdPts = scoreSpeedWeight * Math.exp(-elapsedSec / scoreTimeScaleSec);
    const panPen = scorePanWeight * panDeg;
    const roundScore = Math.max(0, Math.round(accPts + spdPts - panPen));
    gameState.score += roundScore;
    document.getElementById('score').textContent = gameState.score; syncScoreDisplay();

    revealSpaceshipAnswer();
    const feedback = document.getElementById('feedback');
    feedback.innerHTML =
        `Your guess was <strong>${Math.round(dKm).toLocaleString()} km</strong> away in ${elapsedSec.toFixed(1)}s.` +
        `<br><span style="font-size:.9em">+${Math.round(accPts)} accuracy · +${Math.round(spdPts)} speed · −${Math.round(panPen)} panning = <strong>+${roundScore} pts</strong></span>`;
    feedback.className = 'feedback ' + (roundScore >= 0.4 * (scoreAccuracyWeight + scoreSpeedWeight) ? 'correct' : 'incorrect');
}

function skipSpaceshipGuess() {
    if (gameState.capitalSubmitted) return;
    if (gameState.currentGuess) { submitSpaceshipGuess(); return; }
    gameState.capitalSubmitted = true;
    gameState.totalDistanceKm += 5000;
    revealSpaceshipAnswer();
    const feedback = document.getElementById('feedback');
    feedback.innerHTML = `Skipped — <strong>+0 pts</strong>. Your spaceship is marked on the inset map.`;
    feedback.className = 'feedback incorrect';
}

// The QUIZ_MODES keys of every state-level map Name All can target — each is a whole
// separate geography (own quizList/dataObj/map), not a subset of world country data like
// the continents are.
const NAME_ALL_STATE_MODES = ['us-states', 'indian-states', 'german-states', 'uk-states', 'mexican-states'];

// Configure and start name-all for a region: 'world', a continent name (a subset of world
// country data), or one of NAME_ALL_STATE_MODES (an entirely different geography, with its
// own quizList/dataObj/map borrowed wholesale from that mode's own QUIZ_MODES entry).
function startNameAllMode(region) {
    const nm = QUIZ_MODES['name-all'];
    if (NAME_ALL_STATE_MODES.includes(region)) {
        const base = QUIZ_MODES[region];
        nm.quizList = base.quizList;
        nm.dataObjKey = base.dataObjKey;
        nm.useGlobe = base.useGlobe;
        nm.useAlbersUsa = base.useAlbersUsa || false;
        nm.mapUrl = base.mapUrl;
        nm.mapObject = base.mapObject;
        nm.itemLabel = base.itemLabel;
        nm.itemLabelPlural = base.itemLabelPlural;
        nm.regionLabel = base.name;
    } else {
        nm.quizList = (region && region !== 'world' && window.continentData && window.continentData[region])
            ? window.continentData[region] : quizCountries;
        nm.dataObjKey = 'countryData';
        nm.useGlobe = true;
        nm.useAlbersUsa = false;
        nm.mapUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
        nm.mapObject = 'countries';
        nm.itemLabel = 'country';
        nm.itemLabelPlural = 'countries';
        nm.regionLabel = (region && region !== 'world') ? region : 'the World';
    }
    startGameWithMode('name-all');
}

// Region picker for Name All: World + continents (unchanged groups), plus one entry per
// state-level map.
function showNameAllModeSelector() {
    document.getElementById('top-bar').style.display = 'none';
    document.getElementById('landing-header').style.display = '';

    const modeSelector = document.getElementById('mode-selector');
    modeSelector.classList.remove('hidden');
    // icon: 'icon' → material-symbols glyph, 'flag' → flagcdn country flag (matches the
    // Find/Identify region-picker convention for the state-level geographies).
    const regions = [
        ['world', 'icon', 'public', 'World', 'Name every country on Earth'],
        ['North America', 'icon', 'globe', 'North America', 'Name all North American countries'],
        ['South America', 'icon', 'globe', 'South America', 'Name all South American countries'],
        ['Europe', 'icon', 'globe', 'Europe', 'Name all European countries'],
        ['Africa', 'icon', 'globe', 'Africa', 'Name all African countries'],
        ['Asia', 'icon', 'globe', 'Asia', 'Name all Asian countries'],
        ['Oceania', 'icon', 'globe', 'Oceania', 'Name all countries in Oceania'],
        ['us-states', 'flag', 'us', 'USA', 'Name all US states'],
        ['indian-states', 'flag', 'in', 'India', 'Name all Indian states'],
        ['german-states', 'flag', 'de', 'Germany', 'Name all German Bundesländer'],
        ['uk-states', 'flag', 'gb-eng', 'England', 'Name all English counties'],
        ['mexican-states', 'flag', 'mx', 'Mexico', 'Name all Mexican states']
    ];
    modeSelector.innerHTML = `
        <h2>Name All — Choose a Region</h2>
        <div class="mode-buttons">
            ${regions.map(([key, iconType, iconVal, name, desc]) => `
            <button class="mode-btn" data-nameall-region="${key}">
                ${iconType === 'flag'
                    ? `<img class="mode-icon" src="https://flagcdn.com/${iconVal}.svg" alt="${name}" />`
                    : `<span class="mode-icon material-symbols-outlined">${iconVal}</span>`}
                <span class="mode-name">${name}</span>
                <span class="mode-desc">${desc}</span>
            </button>`).join('')}
        </div>
        <button id="back-from-nameall-btn" class="btn secondary" style="margin-top: 20px;">Back</button>
    `;

    document.querySelectorAll('[data-nameall-region]').forEach(btn => {
        btn.addEventListener('click', (e) => startNameAllMode(e.currentTarget.dataset.nameallRegion));
    });
    document.getElementById('back-from-nameall-btn').addEventListener('click', () => resetModeSelector());
}

// ---- Find/Identify "All" vs "Random 10" scope toggle --------------------------------
// One global per screen (not per region — the screens list several regions at once, and
// the choice applies to whichever the player then clicks). Defaults preserve almost all
// existing behaviour: Find already defaulted every STATE region to "all" (only World was
// capped at 10), so Find defaults to "all"; Identify capped every region at 10, so it
// defaults to "random10" — the player can flip either without changing the other.
let findQuizScopeAll = true;
let identifyQuizScopeAll = false;

function scopeToggleHtml(kind, isAll) {
    return `
        <div class="scope-toggle" data-for="${kind}" role="group" aria-label="Number of questions">
            <span class="scope-toggle-label">Questions:</span>
            <button type="button" class="scope-btn${isAll ? ' active' : ''}" data-scope="all">All</button>
            <button type="button" class="scope-btn${isAll ? '' : ' active'}" data-scope="random10">Random 10</button>
        </div>`;
}

// Override a Find-screen mode's totalQuestions per the current toggle state. Identify
// mode computes its own totalQuestions inline (startIdentifyMode) since it always
// reconfigures QUIZ_MODES.identify from scratch per region.
function applyQuizScope(mode, scopeAll) {
    const mc = QUIZ_MODES[mode];
    if (mc && Array.isArray(mc.quizList)) {
        mc.totalQuestions = scopeAll ? mc.quizList.length : Math.min(10, mc.quizList.length);
    }
}

function showFindModeSelector() {
    document.getElementById('top-bar').style.display = 'none';
    document.getElementById('landing-header').style.display = '';

    const modeSelector = document.getElementById('mode-selector');
    modeSelector.classList.remove('hidden');
    modeSelector.innerHTML = `
        <h2>Find on the Map</h2>
        ${scopeToggleHtml('find', findQuizScopeAll)}
        <div class="mode-buttons">
            <button class="mode-btn" data-mode="countries">
                <span class="mode-icon material-symbols-outlined">public</span>
                <span class="mode-name">World</span>
                <span class="mode-desc">Find countries on the globe</span>
            </button>
            <button class="mode-btn" data-mode="us-states">
                <img class="mode-icon" src="https://flagcdn.com/us.svg" alt="USA" />
                <span class="mode-name">USA</span>
                <span class="mode-desc">Find US states on the map</span>
            </button>
            <button class="mode-btn" data-mode="indian-states">
                <img class="mode-icon" src="https://flagcdn.com/in.svg" alt="India" />
                <span class="mode-name">India</span>
                <span class="mode-desc">Find Indian states on the map</span>
            </button>
            <button class="mode-btn" data-mode="german-states">
                <img class="mode-icon" src="https://flagcdn.com/de.svg" alt="Germany" />
                <span class="mode-name">Germany</span>
                <span class="mode-desc">Find German Bundesländer on the map</span>
            </button>
            <button class="mode-btn" data-mode="uk-states">
                <img class="mode-icon" src="https://flagcdn.com/gb-eng.svg" alt="England" />
                <span class="mode-name">England</span>
                <span class="mode-desc">Find English counties on the map</span>
            </button>
            <button class="mode-btn" data-mode="mexican-states">
                <img class="mode-icon" src="https://flagcdn.com/mx.svg" alt="Mexico" />
                <span class="mode-name">Mexico</span>
                <span class="mode-desc">Find Mexican states on the map</span>
            </button>
            <button class="mode-btn" data-mode="mystery-flag">
                <span class="mode-icon material-symbols-outlined">flag</span>
                <span class="mode-name">Flags</span>
                <span class="mode-desc">See the flag, find the country on the globe</span>
            </button>
            <button class="mode-btn" data-mode="capitals-race">
                <span class="mode-icon material-symbols-outlined">museum</span>
                <span class="mode-name">Capitals</span>
                <span class="mode-desc">Find the country from its capital</span>
            </button>
        </div>
        <button id="back-from-find-btn" class="btn secondary" style="margin-top: 20px;">Back</button>
    `;

    document.querySelectorAll('#mode-selector .mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mode = e.currentTarget.dataset.mode;
            applyQuizScope(mode, findQuizScopeAll);
            startGameWithMode(mode);
        });
    });

    document.getElementById('back-from-find-btn').addEventListener('click', () => {
        resetModeSelector();
    });
}

// Show identify mode selector (choose region)
function showIdentifyModeSelector() {
    document.getElementById('top-bar').style.display = 'none';
    document.getElementById('landing-header').style.display = '';

    // Create a temporary selector for identify mode regions
    const modeSelector = document.getElementById('mode-selector');
    modeSelector.classList.remove('hidden');
    const html = `
        <h2>Select Region for Identify Mode</h2>
        ${scopeToggleHtml('identify', identifyQuizScopeAll)}
        <div class="mode-buttons">
            <button class="mode-btn" data-identify-region="countries">
                <span class="mode-icon material-symbols-outlined">public</span>
                <span class="mode-name">World Countries</span>
                <span class="mode-desc">Identify highlighted countries</span>
            </button>
            <button class="mode-btn" data-identify-region="us-states">
                <img class="mode-icon" src="https://flagcdn.com/us.svg" alt="USA" />
                <span class="mode-name">US States</span>
                <span class="mode-desc">Identify highlighted US states</span>
            </button>
            <button class="mode-btn" data-identify-region="indian-states">
                <img class="mode-icon" src="https://flagcdn.com/in.svg" alt="India" />
                <span class="mode-name">Indian States</span>
                <span class="mode-desc">Identify highlighted Indian states</span>
            </button>
            <button class="mode-btn" data-identify-region="german-states">
                <img class="mode-icon" src="https://flagcdn.com/de.svg" alt="Germany" />
                <span class="mode-name">German States</span>
                <span class="mode-desc">Identify highlighted German Bundesländer</span>
            </button>
            <button class="mode-btn" data-identify-region="uk-states">
                <img class="mode-icon" src="https://flagcdn.com/gb-eng.svg" alt="England" />
                <span class="mode-name">England Counties</span>
                <span class="mode-desc">Identify highlighted English counties</span>
            </button>
            <button class="mode-btn" data-identify-region="mexican-states">
                <img class="mode-icon" src="https://flagcdn.com/mx.svg" alt="Mexico" />
                <span class="mode-name">Mexican States</span>
                <span class="mode-desc">Identify highlighted Mexican states</span>
            </button>
        </div>
        <button id="back-from-identify-btn" class="btn secondary" style="margin-top: 20px;">Back</button>
    `;

    modeSelector.innerHTML = html;

    // Add event listeners for identify region buttons
    document.querySelectorAll('[data-identify-region]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const region = e.currentTarget.dataset.identifyRegion;
            startIdentifyMode(region);
        });
    });

    // Back button
    document.getElementById('back-from-identify-btn').addEventListener('click', () => {
        resetModeSelector();
    });
}

// Start identify mode with selected region
function startIdentifyMode(region) {
    // Configure identify mode with the selected region's data
    const baseMode = region === 'countries' ? 'countries' : region;
    const baseModeConfig = QUIZ_MODES[baseMode];

    // Update identify mode configuration
    QUIZ_MODES.identify.quizList = baseModeConfig.quizList;
    QUIZ_MODES.identify.dataObjKey = baseModeConfig.dataObjKey;
    QUIZ_MODES.identify.useGlobe = baseModeConfig.useGlobe;
    QUIZ_MODES.identify.useAlbersUsa = baseModeConfig.useAlbersUsa || false;
    QUIZ_MODES.identify.mapUrl = baseModeConfig.mapUrl;
    QUIZ_MODES.identify.mapObject = baseModeConfig.mapObject;
    QUIZ_MODES.identify.itemLabel = baseModeConfig.itemLabel;
    QUIZ_MODES.identify.itemLabelPlural = baseModeConfig.itemLabelPlural;
    QUIZ_MODES.identify.totalQuestions = identifyQuizScopeAll
        ? baseModeConfig.quizList.length
        : Math.min(10, baseModeConfig.quizList.length);

    // Start game with identify mode
    startGameWithMode('identify');
}

// Reset mode selector to original state
function resetModeSelector() {
    const modeSelector = document.getElementById('mode-selector');
    modeSelector.innerHTML = `
        <h2>Select Quiz Mode</h2>
        <div class="mode-buttons" id="mode-buttons">
            <button class="mode-btn" data-mode="find">
                <span class="mode-icon material-symbols-outlined">search</span>
                <span class="mode-name">Find on the Map</span>
                <span class="mode-desc">Find countries or states on the globe/map</span>
            </button>
            <button class="mode-btn" data-mode="identify">
                <span class="mode-icon material-symbols-outlined">help</span>
                <span class="mode-name">Identify Mode</span>
                <span class="mode-desc">Identify highlighted locations on the map</span>
            </button>
            <button class="mode-btn" data-mode="name-all">
                <span class="mode-icon material-symbols-outlined">keyboard</span>
                <span class="mode-name">Name All Countries</span>
                <span class="mode-desc">Type as many countries as you can!</span>
            </button>
            <button class="mode-btn" data-mode="population-order">
                <span class="mode-icon material-symbols-outlined">bar_chart</span>
                <span class="mode-name">Order by Population</span>
                <span class="mode-desc">Drag countries to order them by population</span>
            </button>
            <button class="mode-btn" data-mode="mystery-flag">
                <span class="mode-icon material-symbols-outlined">flag</span>
                <span class="mode-name">Mystery Flag</span>
                <span class="mode-desc">See the flag, find the country on the globe</span>
            </button>
            <button class="mode-btn" data-mode="capitals-race">
                <span class="mode-icon material-symbols-outlined">museum</span>
                <span class="mode-name">Capitals Race</span>
                <span class="mode-desc">Type the capital of each highlighted country</span>
            </button>
            <button class="mode-btn" data-mode="free-explore">
                <span class="mode-icon material-symbols-outlined">explore</span>
                <span class="mode-name">Free Explore</span>
                <span class="mode-desc">Explore the globe and click to learn about countries</span>
            </button>
            <button class="mode-btn" data-mode="country-shape-id">
                <span class="mode-icon material-symbols-outlined">extension</span>
                <span class="mode-name">Country Shape ID</span>
                <span class="mode-desc">Identify countries by their shape</span>
            </button>
            <button class="mode-btn" data-mode="find-capital">
                <span class="mode-icon material-symbols-outlined">location_city</span>
                <span class="mode-name">Find the Capital</span>
                <span class="mode-desc">Pin a capital's location on the map by distance</span>
            </button>
            <button class="mode-btn" data-mode="spaceship">
                <span class="mode-icon material-symbols-outlined">rocket_launch</span>
                <span class="mode-name">Where Is My Spaceship?</span>
                <span class="mode-desc">Guess your orbital location from the view below</span>
            </button>
            <!-- Skyline ID: hidden until the photo pool is vetted (mode still fully works —
                 see skylineIdMode in game.js). Uncomment to bring it back to the menu. -->
            <!-- <button class="mode-btn" data-mode="skyline-id">
                <span class="mode-icon material-symbols-outlined">apartment</span>
                <span class="mode-name">Skyline ID</span>
                <span class="mode-desc">Name the city from a photo of its skyline</span>
            </button> -->
        </div>
    `;

    // Re-attach event listeners
    document.querySelectorAll('#mode-selector .mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mode = e.currentTarget.dataset.mode;
            if (mode === 'find') {
                showFindModeSelector();
            } else if (mode === 'identify') {
                showIdentifyModeSelector();
            } else if (mode === 'name-all') {
                showNameAllModeSelector();
            } else {
                startGameWithMode(mode);
            }
        });
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
