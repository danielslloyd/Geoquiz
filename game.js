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

// Load and validate all data files
async function initializeGameData() {
  try {
    const dataFiles = [
      { key: 'countryData', path: 'data/countries.json' },
      { key: 'usStateData', path: 'data/us-states.json' },
      { key: 'indianStateData', path: 'data/indian-states.json' },
      { key: 'germanStateData', path: 'data/german-states.json' }
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
    'Romania', 'Rwanda', 'Samoa', 'San Marino', 'Sao Tome and Principe',
    'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Slovakia',
    'Slovenia', 'Solomon Islands', 'Somalia', 'South Sudan', 'Sri Lanka',
    'Sudan', 'Suriname', 'Syria', 'Tajikistan', 'Tanzania',
    'East Timor', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia',
    'Turkmenistan', 'Tuvalu', 'Uganda', 'United Arab Emirates', 'Uruguay',
    'Uzbekistan', 'Vanuatu', 'Vatican City', 'Yemen', 'Zambia', 'Zimbabwe'
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


// UK constituent countries
const ukCountries = ['England', 'Scotland', 'Wales', 'Northern Ireland'];

const ukCountryData = {
    'England': {
        code: 'gb-eng',
        capital: 'London',
        similar: ['Scotland', 'Wales', 'Northern Ireland']
    },
    'Scotland': {
        code: 'gb-sct',
        capital: 'Edinburgh',
        similar: ['England', 'Wales', 'Northern Ireland']
    },
    'Wales': {
        code: 'gb-wls',
        capital: 'Cardiff',
        similar: ['England', 'Scotland', 'Northern Ireland']
    },
    'Northern Ireland': {
        code: 'gb-nir',
        capital: 'Belfast',
        similar: ['England', 'Scotland', 'Wales']
    }
};

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
        totalQuestions: 10,
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
        totalQuestions: 10,
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
        totalQuestions: 10,
        useGlobe: false,
        mapUrl: '4_niedrig.geo.json',
        mapObject: null,
        hasFlags: false,
        itemLabel: 'state',
        itemLabelPlural: 'states',
        autoRotate: false
    },
    'uk-states': {
        name: 'UK Countries',
        quizList: ukCountries,
        dataObjKey: 'ukCountryData',
        totalQuestions: 4,
        useGlobe: false,
        mapUrl: 'uk-countries.geo.json',
        mapObject: null,
        hasFlags: false,
        itemLabel: 'country',
        itemLabelPlural: 'countries',
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
        useGlobe: true,
        mapUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
        mapObject: 'countries',
        hasFlags: false,
        itemLabel: 'country',
        itemLabelPlural: 'countries',
        autoRotate: false,
        countryShapeIdMode: true // Identify country by shape with multiple choice
    }
};

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
        // Show correct answer after delay and automatically advance
        setTimeout(() => {
            const buttons = document.querySelectorAll('.option-btn');
            let correctButton = null;
            buttons.forEach(btn => {
                if (btn.textContent === correctAnswer) {
                    btn.classList.add('correct');
                    correctButton = btn;
                }
            });
            // Automatically handle the correct answer to advance the game
            if (correctButton && !gameState.answeredCorrectly) {
                handleCorrectAnswer(correctButton);
            }
        }, 1000);
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
    stopGlobeSpin(); // Clear any existing spin

    const spinStep = () => {
        const [lon, lat, roll] = projection.rotate();
        // Increment longitude to spin east (right)
        projection.rotate([lon + speed, lat, roll || 0]);
        countriesGroup.selectAll('path').attr('d', path);
    };

    // Spin every 50ms for smooth animation
    globeSpinInterval = setInterval(spinStep, 50);
}

// Highlight country on globe
function highlightCountryOnGlobe(countryName) {
    const country = gameState.countries.find(c => c.properties.name === countryName);
    if (!country) return;

    countriesGroup.selectAll('path')
        .filter(d => d.properties.name === countryName)
        .classed('target', true);
}

// Clear multiple choice UI
function clearMultipleChoice() {
    const grid = document.getElementById('options-grid');
    grid.innerHTML = '';
    grid.className = 'options-grid'; // Reset to default class
    document.getElementById('multiple-choice-container').classList.add('hidden');
    document.getElementById('flag-display').style.display = 'none';
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
    const modeConfig = QUIZ_MODES[mode];
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

    // Show gamma lock toggle only for globe modes
    const gammaToggle = document.getElementById('gamma-lock-toggle');
    gammaToggle.style.display = modeConfig.useGlobe ? '' : 'none';

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
    // Skip map loading for ordering modes (they don't use maps)
    if (modeConfig.orderingMode) {
        startNewQuestion();
    } else {
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

// Set up the globe SVG and projection
function setupGlobe() {
    const modeConfig = QUIZ_MODES[gameState.mode];

    // Select the appropriate SVG element based on layout
    const svgId = modeConfig.useWorldQuizLayout ? '#globe-world' : '#globe';

    // Clear any existing content in the SVG
    d3.select(svgId).selectAll('*').remove();

    svg = d3.select(svgId)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('width', '100%')
        .style('height', 'auto')
        .style('touch-action', 'none');

    if (modeConfig.useGlobe) {
        // Orthographic projection for globe view
        projection = d3.geoOrthographic()
            .scale(Math.min(width, height) / 2 - 10)
            .translate([width / 2, height / 2])
            .clipAngle(90);
    } else if (modeConfig.useAlbersUsa) {
        // Albers USA composite projection — AK and HI insets are built in
        projection = d3.geoAlbersUsa();
    } else {
        // Mercator projection for regional maps (India, Germany, etc.)
        projection = d3.geoMercator()
            .center([0, 0])
            .scale(1)
            .translate([width / 2, height / 2]);
    }

    path = d3.geoPath().projection(projection);

    // Add gradient for ocean
    const defs = svg.append('defs');
    const gradient = defs.append('radialGradient')
        .attr('id', 'ocean-gradient');

    gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#4a90e2');

    gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#1e3a5f');

    // Create main group
    g = svg.append('g');

    if (modeConfig.useGlobe) {
        // Draw ocean for globe view
        g.append('circle')
            .attr('cx', width / 2)
            .attr('cy', height / 2)
            .attr('r', projection.scale())
            .attr('fill', 'url(#ocean-gradient)')
            .attr('stroke', '#1e3a5f')
            .attr('stroke-width', 2);
    }

    // Group for countries
    countriesGroup = g.append('g');

    // Add drag behavior only for globe modes (not for states)
    if (modeConfig.useGlobe) {
        const drag = d3.drag()
            .on('start', dragStart)
            .on('drag', dragging)
            .on('end', dragEnd);

        svg.call(drag);
    }

    // Add zoom behavior with scroll wheel (Jason Davies style)
    svg.on('wheel', function(event) {
        // Don't allow scrolling if locked
        if (gameState.scrollLocked) {
            event.preventDefault();
            return;
        }

        event.preventDefault();

        const delta = -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002);
        const scale = projection.scale();
        const k = Math.pow(2, delta);
        const newScale = scale * k;

        // Set min and max scale limits (don't zoom out beyond starting view)
        const minScale = gameState.initialScale || 100;
        const maxScale = 2000;

        if (newScale >= minScale && newScale <= maxScale) {
            const modeConfig = QUIZ_MODES[gameState.mode];

            if (modeConfig.useGlobe) {
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
                    if (QUIZ_MODES[gameState.mode].useGlobe) {
                        g.select('circle').attr('r', newScale);
                    }
                    countriesGroup.selectAll('path').attr('d', path);
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
            const mc = QUIZ_MODES[gameState.mode];
            if (mc.useGlobe) {
                projection.rotate(r0);
                const v1 = versor.cartesian(projection.invert(p));
                const q1 = versor.multiply(q0, versor.delta(v0, v1));
                const r1 = versor.rotation(q1);
                r_unconstrained = r1;
                const constrainedLat = Math.max(-85, Math.min(85, r1[1]));
                projection.rotate([r1[0], constrainedLat, gammaLocked ? 0 : r1[2]]);
            } else {
                // Flat map pan
                if (touchState.lastCenter) {
                    const pdx = p[0] - touchState.lastCenter[0];
                    const pdy = p[1] - touchState.lastCenter[1];
                    const t = projection.translate();
                    projection.translate([t[0] + pdx, t[1] + pdy]);
                }
            }
            touchState.lastCenter = p;
            countriesGroup.selectAll('path').attr('d', path);
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

// Load map data based on current mode
function loadMapData() {
    const modeConfig = QUIZ_MODES[gameState.mode];

    d3.json(modeConfig.mapUrl)
        .then(data => {
            // Check mapObject to determine how to process the data
            if (modeConfig.mapObject === 'countries') {
                gameState.countries = topojson.feature(data, data.objects.countries).features;

                // Add country names
                gameState.countries.forEach(country => {
                    country.properties.name = getCountryName(country.id);
                });
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

            drawCountries();
            gameState.initialScale = projection.scale();
            startNewQuestion();
        })
        .catch(error => {
            console.error('Error loading map data:', error);
            document.getElementById('question-text').textContent = 'Error loading map data';
        });
}

// Load world map data (legacy function for backwards compatibility)
function loadWorldData() {
    loadMapData();
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
        642: 'Romania', 643: 'Russia', 646: 'Rwanda', 682: 'Saudi Arabia', 686: 'Senegal',
        688: 'Serbia', 690: 'Seychelles', 694: 'Sierra Leone', 702: 'Singapore',
        703: 'Slovakia', 704: 'Vietnam', 705: 'Slovenia', 706: 'Somalia', 710: 'South Africa',
        716: 'Zimbabwe', 724: 'Spain', 728: 'South Sudan', 729: 'Sudan', 732: 'Western Sahara',
        740: 'Suriname', 748: 'Eswatini', 752: 'Sweden', 756: 'Switzerland', 760: 'Syria',
        762: 'Tajikistan', 764: 'Thailand', 768: 'Togo', 776: 'Tonga', 780: 'Trinidad and Tobago',
        784: 'United Arab Emirates', 788: 'Tunisia', 792: 'Turkey', 795: 'Turkmenistan',
        800: 'Uganda', 804: 'Ukraine', 807: 'North Macedonia', 818: 'Egypt', 826: 'United Kingdom',
        831: 'Guernsey', 832: 'Jersey', 834: 'Tanzania', 840: 'United States of America',
        854: 'Burkina Faso', 858: 'Uruguay', 860: 'Uzbekistan', 862: 'Venezuela',
        876: 'Wallis and Futuna', 882: 'Samoa', 887: 'Yemen', 894: 'Zambia'
    };

    return countryNames[id] || `Country ${id}`;
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

// Draw countries on the globe
function drawCountries() {
    countriesGroup.selectAll('path')
        .data(gameState.countries)
        .enter()
        .append('path')
        .attr('class', 'country')
        .attr('d', path)
        .on('click', handleCountryClick);
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
    const clickedCountry = d.properties.name;
    const isCorrect = clickedCountry === gameState.targetCountry;

    if (isCorrect) {
        if (modeConfig.useWorldQuizLayout) {
            // For World Quiz Layout, color correct country bright green and zoom to it
            d3.select(event.target).classed('target', true);
            gameState.answeredCorrectly = true;
            gameState.score++;
            document.getElementById('score').textContent = gameState.score; syncScoreDisplay();

            // Zoom to correct country, then advance
            zoomAndRotateToCountry(gameState.targetCountry, 800).then(() => {
                // Keep scrolling locked until next question
                setTimeout(() => {
                    gameState.subQuestionIndex++;
                    startNewQuestion();
                }, 500);
            });
        } else {
            handleCorrectAnswer(event.target);
            gameState.scrollLocked = false;
        }
    } else {
        if (modeConfig.useWorldQuizLayout) {
            // For World Quiz Layout, color incorrect country red instantly
            const incorrectElement = d3.select(event.target);
            incorrectElement.classed('incorrect', true);

            // Zoom to incorrect country and hold for 0.1s
            zoomAndRotateToCountry(clickedCountry, 600).then(() => {
                return new Promise(resolve => setTimeout(resolve, 100));
            }).then(() => {
                // Find and highlight the correct country in green
                countriesGroup.selectAll('path').each(function(countryData) {
                    if (countryData.properties.name === gameState.targetCountry) {
                        d3.select(this).classed('target', true);
                    }
                });

                // Zoom to correct country
                return zoomAndRotateToCountry(gameState.targetCountry, 800);
            }).then(() => {
                // Advance to next sub-question after showing the correct answer
                setTimeout(() => {
                    gameState.subQuestionIndex++;
                    startNewQuestion();
                }, 500);
            });
        } else {
            handleIncorrectAnswer(event.target);

            // Highlight the correct answer in green
            highlightCountryOnGlobe(gameState.targetCountry);

            // Auto-advance to next sub-question even on incorrect answer
            const modeConfig = QUIZ_MODES[gameState.mode];
            const maxSub = (modeConfig.identifyOnly || modeConfig.mysteryFlagMode) ? 1 : (modeConfig.hasFlags ? 3 : 2);

            if (gameState.subQuestionIndex < maxSub - 1) {
                // Show correct (green) and incorrect (red) for 750ms, then advance
                setTimeout(() => {
                    gameState.subQuestionIndex++;
                    gameState.scrollLocked = false;
                    startNewQuestion();
                }, 750);
            } else {
                // All sub-questions complete, enable next question button
                gameState.scrollLocked = false;
                document.getElementById('next-btn').disabled = false;

                // For mystery-flag mode, reveal the correct country after an incorrect guess
                if (modeConfig.mysteryFlagMode) {
                    setTimeout(() => {
                        highlightCountryOnGlobe(gameState.targetCountry);
                        rotateToCountry(gameState.targetCountry);
                    }, 500);
                }
            }
        }
    }
}

// Handle correct answer
function handleCorrectAnswer(element) {
    gameState.answeredCorrectly = true;
    gameState.score++;

    // Update UI
    if (element && element.classed) {
        d3.select(element).classed('selected', false).classed('target', true);
    }
    document.getElementById('score').textContent = gameState.score; syncScoreDisplay();

    // Determine max sub-questions based on mode
    const modeConfig = QUIZ_MODES[gameState.mode];
    let maxSub;
    if (modeConfig.identifyOnly || modeConfig.mysteryFlagMode || modeConfig.capitalsRaceMode) {
        maxSub = 1; // Single-question-per-country modes
    } else {
        maxSub = modeConfig.hasFlags ? 3 : 2; // 2 if no flags, 3 if flags
    }

    // Auto-advance to next sub-question or enable next button immediately
    if (gameState.subQuestionIndex < maxSub - 1) {
        // Automatically move to next sub-question immediately
        gameState.subQuestionIndex++;
        startNewQuestion();
    } else {
        // All sub-questions complete, enable next question button
        document.getElementById('next-btn').disabled = false;
    }
}

// Handle incorrect answer
function handleIncorrectAnswer(element) {
    d3.select(element).classed('selected', false).classed('incorrect', true);

    // Remove incorrect styling after a short delay
    setTimeout(() => {
        d3.select(element).classed('incorrect', false);
    }, 800);
}

// Handle give up - reveal answer without awarding points
function giveUp() {
    // Special handling for name-all mode
    const modeConfig = QUIZ_MODES[gameState.mode];
    if (modeConfig.nameAllMode) {
        handleNameAllGiveUp();
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
    let maxSub;
    if (modeConfig.identifyOnly || modeConfig.mysteryFlagMode || modeConfig.capitalsRaceMode || modeConfig.countryShapeIdMode) {
        maxSub = 1;
    } else {
        maxSub = modeConfig.hasFlags ? 3 : 2;
    }

    // Auto-advance or enable next button
    if (gameState.subQuestionIndex < maxSub - 1) {
        setTimeout(() => {
            gameState.subQuestionIndex++;
            startNewQuestion();
        }, 2500);
    } else {
        document.getElementById('next-btn').disabled = false;
    }
}

// Start a new question
function startNewQuestion() {
    // Stop any globe spinning from the previous question
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
    document.getElementById('give-up-btn').style.display = 'inline-block';

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
    } else if (gameState.subQuestionIndex > 0 && !modeConfig.useWorldQuizLayout) {
        // For follow-up questions in non-world-quiz modes, only clear incorrect/selected but keep target highlighted
        countriesGroup.selectAll('path')
            .classed('selected', false)
            .classed('incorrect', false);
    }

    // Clear multiple choice
    clearMultipleChoice();

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
    if (modeConfig.useGlobe && modeConfig.autoRotate) {
        rotateToCountry(gameState.targetCountry);
    } else if (modeConfig.useGlobe && !modeConfig.autoRotate && !modeConfig.useWorldQuizLayout) {
        // Reset to 0,0,0 for modes that need it (but not World Quiz Layout)
        projection.rotate([0, 0, 0]);
        r_unconstrained = [0, 0, 0];
        countriesGroup.selectAll('path').attr('d', path);
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

            // Auto-advance to capital question immediately
            gameState.subQuestionIndex++;
            startNewQuestion();
        } else {
            handleCorrectAnswer(element);
        }
    } else {
        element.classList.add('incorrect');

        if (modeConfig.useWorldQuizLayout) {
            // Remove incorrect styling after a short delay
            setTimeout(() => {
                element.classList.remove('selected', 'incorrect');
            }, 800);
        } else {
            handleIncorrectAnswer(element);
            // Show correct answer after delay and auto-advance
            setTimeout(() => {
                const flagOptions = document.querySelectorAll('.flag-option');
                let correctElement = null;
                flagOptions.forEach(opt => {
                    const img = opt.querySelector('img');
                    if (img && img.src === getFlagUrl(correctAnswer)) {
                        opt.classList.add('correct');
                        correctElement = opt;
                    }
                });
                // Auto-advance after showing the correct answer
                if (correctElement) {
                    setTimeout(() => {
                        handleCorrectAnswer(correctElement);
                    }, 800);
                }
            }, 1000);
        }
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

        // Auto-advance to next country immediately
        // Reset sub-question index and move to next country
        gameState.subQuestionIndex = 0;
        gameState.currentQuestion++;
        if (gameState.currentQuestion <= gameState.totalQuestions) {
            gameState.answeredCorrectly = false;
            startNewQuestion();
        } else {
            endGame();
        }
    } else {
        element.classList.add('incorrect');

        // Remove incorrect styling after a short delay
        setTimeout(() => {
            element.classList.remove('selected', 'incorrect');
        }, 800);
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

    // Stop any existing globe spin before rotating
    stopGlobeSpin();

    // Rotate globe/map to show the target and start spinning
    if (QUIZ_MODES[gameState.mode].useGlobe) {
        rotateToCountry(gameState.targetCountry);
        // Start globe spin after rotation animation completes
        setTimeout(() => {
            startGlobeSpin(0.15); // Slow eastward spin
        }, 1100); // Wait for rotation animation (1000ms) + small buffer
    }

    // Generate multiple choice options
    const options = generateMultipleChoiceOptions(gameState.targetCountry, 'item');
    renderMultipleChoice(options, gameState.targetCountry);
}

// Render name-all mode question
function renderNameAllMode() {
    gameState.questionType = 'name-all';
    gameState.foundCountries = new Set();
    gameState.nameAllStartTime = Date.now();
    gameState.nameAllGaveUp = false;

    // Add name-all-mode class to container for styling
    document.querySelector('.container').classList.add('name-all-mode');

    // Filter quiz list to only include countries that exist in the loaded map data
    gameState.currentQuizList = gameState.currentQuizList.filter(item =>
        gameState.countries.some(c => c.properties.name === item)
    );
    const totalCountries = gameState.currentQuizList.length;

    // Hide question counter for name-all mode
    const questionCounter = document.querySelector('.score-item:has(#current-question)');
    if (questionCounter) {
        questionCounter.style.display = 'none';
    }

    document.getElementById('question-text').innerHTML = `Type all the countries! Score: <span id="score-inline">${gameState.score}</span> | Found: <span id="found-count">0</span>/${totalCountries}`;

    document.getElementById('flag-display').style.display = 'none';
    document.getElementById('multiple-choice-container').classList.add('hidden');

    // Create and show input field
    createNameAllInput();

    // Reset globe rotation
    projection.rotate([0, 0, 0]);
    r_unconstrained = [0, 0, 0];

    // Ensure all countries are visible with clear borders
    countriesGroup.selectAll('path')
        .attr('d', path)
        .classed('target', false)
        .classed('incorrect', false)
        .classed('selected', false)
        .style('fill', '#e0e0e0')  // Light gray fill for all countries
        .style('stroke', '#fff')    // White borders
        .style('stroke-width', '1') // Slightly thicker borders for visibility
        .style('opacity', 1);       // Ensure full opacity

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
        input.placeholder = 'Type a country name...';
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

    // Show and focus input
    inputContainer.style.display = 'block';
    document.getElementById('name-all-input').value = '';
    document.getElementById('name-all-input').focus();
}

// Handle input changes in name-all mode
function handleNameAllInput(event) {
    if (gameState.nameAllGaveUp) return;

    const input = event.target;
    const inputValue = input.value.trim();

    if (!inputValue) return;

    // Normalize input for comparison (lowercase, remove extra spaces)
    const normalizedInput = inputValue.toLowerCase().replace(/\s+/g, ' ');

    // Check if input matches any alternate names
    let countryMatch = null;
    if (countryAltNames[normalizedInput]) {
        countryMatch = countryAltNames[normalizedInput];
    }

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

// Highlight a found country in name-all mode
function highlightFoundCountry(countryName) {
    countriesGroup.selectAll('path')
        .filter(d => d.properties.name === countryName)
        .classed('target', true)
        .style('fill', '#4CAF50')
        .style('stroke', '#2e7d32');

    // Smoothly zoom to the country
    zoomAndRotateToCountry(countryName, 600);
}

// Update the found counter display
function updateFoundCounter() {
    const totalCountries = gameState.currentQuizList.filter(item =>
        gameState.countries.some(c => c.properties.name === item)
    ).length;

    document.getElementById('found-count').textContent = gameState.foundCountries.size;
    document.getElementById('score').textContent = gameState.score; syncScoreDisplay();
}

// Check if all countries have been found
function checkNameAllComplete() {
    const totalCountries = gameState.currentQuizList.filter(item =>
        gameState.countries.some(c => c.properties.name === item)
    ).length;

    if (gameState.foundCountries.size >= totalCountries) {
        // All countries found!
        const elapsedTime = Math.round((Date.now() - gameState.nameAllStartTime) / 1000);
        const minutes = Math.floor(elapsedTime / 60);
        const seconds = elapsedTime % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        const feedback = document.getElementById('feedback');
        feedback.textContent = `🎉 Congratulations! You named all ${totalCountries} countries in ${timeStr}!`;
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

// Handle give up for name-all mode
function handleNameAllGiveUp() {
    gameState.nameAllGaveUp = true;

    // Hide input
    const inputContainer = document.getElementById('name-all-input-container');
    if (inputContainer) {
        inputContainer.style.display = 'none';
    }

    // Highlight all missed countries in red and create list
    const missedCountries = [];
    gameState.currentQuizList.forEach(countryName => {
        const exists = gameState.countries.some(c => c.properties.name === countryName);
        if (exists && !gameState.foundCountries.has(countryName)) {
            missedCountries.push(countryName);

            // Highlight in red
            countriesGroup.selectAll('path')
                .filter(d => d.properties.name === countryName)
                .classed('incorrect', true)
                .style('fill', '#f44336')
                .style('stroke', '#c62828');
        }
    });

    // Show feedback with missed countries
    const totalCountries = gameState.currentQuizList.filter(item =>
        gameState.countries.some(c => c.properties.name === item)
    ).length;

    const feedback = document.getElementById('feedback');
    feedback.innerHTML = `
        <div>
            <p>You found ${gameState.foundCountries.size} out of ${totalCountries} countries.</p>
            <p style="margin-top: 10px;"><strong>Missed countries:</strong></p>
            <div style="max-height: 200px; overflow-y: auto; margin-top: 10px; text-align: left;">
                ${missedCountries.sort().map(name => `<div style="padding: 3px 0;">• ${name}</div>`).join('')}
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

    document.getElementById('next-btn').disabled = false;
}

// ==================== FREE EXPLORE MODE ====================

// Render free explore mode (interactive globe with popups)
function renderFreeExploreMode() {
    gameState.questionType = 'free-explore';

    document.getElementById('question-text').innerHTML = `<strong>Explore the Globe</strong><br><span style="font-size:0.8em;color:#888;">Click any country to see details</span>`;
    document.getElementById('flag-display').style.display = 'none';
    document.getElementById('multiple-choice-container').classList.add('hidden');

    // Hide buttons for free explore
    document.getElementById('next-btn').style.display = 'none';
    document.getElementById('give-up-btn').style.display = 'none';

    // Show exit button
    let exitBtn = document.getElementById('exit-explore-btn');
    if (!exitBtn) {
        exitBtn = document.createElement('button');
        exitBtn.id = 'exit-explore-btn';
        exitBtn.textContent = 'Exit Explore';
        exitBtn.className = 'btn btn-primary';
        exitBtn.onclick = exitFreeExplore;
        document.getElementById('button-container').appendChild(exitBtn);
    }
    exitBtn.style.display = 'inline-block';
}

// Handle exit from free explore mode
function exitFreeExplore() {
    // Return to landing page
    goHome();
}

// Show country popup with stats and flag
function showCountryPopup(countryName) {
    const data = gameState.currentDataObj[countryName];
    if (!data) {
        console.warn(`No data found for ${countryName}`);
        return;
    }

    const flagUrl = getFlagUrl(countryName);
    const capital = getCapital(countryName) || 'N/A';
    const population = data.population ? data.population.toLocaleString() : 'N/A';

    const popupHtml = `
        <div class="explore-popup-content">
            <h3>${countryName}</h3>
            ${flagUrl ? `<img src="${flagUrl}" alt="Flag of ${countryName}" class="explore-flag">` : ''}
            <div class="explore-details">
                <p><strong>Capital:</strong> ${capital}</p>
                <p><strong>Population:</strong> ${population}</p>
            </div>
            <button onclick="closeCountryPopup()" class="btn-close">Close</button>
        </div>
    `;

    let popup = document.getElementById('explore-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'explore-popup';
        popup.className = 'explore-popup';
        document.body.appendChild(popup);
    }

    popup.innerHTML = popupHtml;
    popup.style.display = 'block';
}

// Close country popup
function closeCountryPopup() {
    const popup = document.getElementById('explore-popup');
    if (popup) {
        popup.style.display = 'none';
    }
}

// ==================== COUNTRY SHAPE ID MODE ====================

// Render country shape ID question
function renderCountryShapeIdQuestion() {
    gameState.questionType = 'country-shape-id';

    document.getElementById('question-text').innerHTML = `Which country is highlighted?`;
    document.getElementById('flag-display').style.display = 'none';

    // Highlight the target country on globe
    countriesGroup.selectAll('path')
        .classed('target', false)
        .classed('target-muted', false);

    countriesGroup.selectAll('path').each(function(d) {
        if (d.properties.name === gameState.targetCountry) {
            d3.select(this).classed('target', true);
        } else {
            d3.select(this).classed('target-muted', true);
        }
    });

    // Generate multiple choice options
    const options = generateMultipleChoiceOptions(gameState.targetCountry, 'item');
    renderMultipleChoice(options, gameState.targetCountry);
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

    // Show next button
    document.getElementById('next-btn').style.display = 'inline-block';
    document.getElementById('next-btn').disabled = false;

    // Move to next question
    gameState.currentQuestion++;
}


// Rotate globe to show target country
function rotateToCountry(countryName) {
    const country = gameState.countries.find(c => c.properties.name === countryName);
    if (!country) return;

    const centroid = d3.geoCentroid(country);

    d3.transition()
        .duration(1000)
        .tween('rotate', () => {
            const r = d3.interpolate(projection.rotate(), [-centroid[0], -centroid[1]]);
            return t => {
                projection.rotate(r(t));
                countriesGroup.selectAll('path').attr('d', path);
            };
        })
        .on('end', () => {
            r_unconstrained = projection.rotate().slice();
        });
}

// Zoom and rotate to show target country (for quiz feedback)
function zoomAndRotateToCountry(countryName, duration = 800) {
    const country = gameState.countries.find(c => c.properties.name === countryName);
    if (!country) return Promise.resolve();

    const centroid = d3.geoCentroid(country);
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
let gammaLocked = true;  // When true, gamma (tilt/roll) is locked to 0

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

    // Save unconstrained rotation for next drag to maintain quaternion continuity
    r_unconstrained = r1;

    // Constrain rotation to prevent going upside down
    // Allow both longitude and latitude changes, but limit latitude to prevent flipping
    // Limit latitude to [-85, 85] degrees (similar to web maps)
    const constrainedLat = Math.max(-85, Math.min(85, r1[1]));
    projection.rotate([r1[0], constrainedLat, gammaLocked ? 0 : r1[2]]);
    countriesGroup.selectAll('path').attr('d', path);
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
    var t = Math.acos(Math.max(-1, Math.min(1, versor.dot(v0, v1))));
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
    let maxSub;
    if (modeConfig.identifyOnly || modeConfig.mysteryFlagMode || modeConfig.capitalsRaceMode) {
        maxSub = 1;
    } else {
        maxSub = modeConfig.hasFlags ? 3 : 2;
    }
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

    // Home link in header
    const homeLink = document.getElementById('home-link');
    if (homeLink) {
        homeLink.addEventListener('click', goHome);
    } else {
        console.error('home-link element not found');
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
        // Reset sub-question index and move to next item
        gameState.subQuestionIndex = 0;
        gameState.currentQuestion++;
        startNewQuestion();
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
        }
    });
}

// Show find mode selector (choose region)
function showFindModeSelector() {
    document.getElementById('top-bar').style.display = 'none';
    document.getElementById('landing-header').style.display = '';

    const modeSelector = document.getElementById('mode-selector');
    modeSelector.classList.remove('hidden');
    modeSelector.innerHTML = `
        <h2>Find on the Map</h2>
        <div class="mode-buttons">
            <button class="mode-btn" data-mode="countries">
                <span class="mode-icon material-icons">public</span>
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
                <img class="mode-icon" src="https://flagcdn.com/gb.svg" alt="UK" />
                <span class="mode-name">UK</span>
                <span class="mode-desc">Find UK countries on the map</span>
            </button>
        </div>
        <button id="back-from-find-btn" class="btn secondary" style="margin-top: 20px;">Back</button>
    `;

    document.querySelectorAll('#mode-selector .mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            startGameWithMode(e.currentTarget.dataset.mode);
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
        <div class="mode-buttons">
            <button class="mode-btn" data-identify-region="countries">
                <span class="mode-icon material-icons">public</span>
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
                <img class="mode-icon" src="https://flagcdn.com/gb.svg" alt="UK" />
                <span class="mode-name">UK Countries</span>
                <span class="mode-desc">Identify highlighted UK countries</span>
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
    QUIZ_MODES.identify.dataObj = baseModeConfig.dataObj;
    QUIZ_MODES.identify.useGlobe = baseModeConfig.useGlobe;
    QUIZ_MODES.identify.useAlbersUsa = baseModeConfig.useAlbersUsa || false;
    QUIZ_MODES.identify.mapUrl = baseModeConfig.mapUrl;
    QUIZ_MODES.identify.mapObject = baseModeConfig.mapObject;
    QUIZ_MODES.identify.itemLabel = baseModeConfig.itemLabel;
    QUIZ_MODES.identify.itemLabelPlural = baseModeConfig.itemLabelPlural;
    QUIZ_MODES.identify.totalQuestions = Math.min(10, baseModeConfig.quizList.length);

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
                <span class="mode-icon material-icons">search</span>
                <span class="mode-name">Find on the Map</span>
                <span class="mode-desc">Find countries or states on the globe/map</span>
            </button>
            <button class="mode-btn" data-mode="identify">
                <span class="mode-icon material-icons">help</span>
                <span class="mode-name">Identify Mode</span>
                <span class="mode-desc">Identify highlighted locations on the map</span>
            </button>
            <button class="mode-btn" data-mode="name-all">
                <span class="mode-icon material-icons">keyboard</span>
                <span class="mode-name">Name All Countries</span>
                <span class="mode-desc">Type as many countries as you can!</span>
            </button>
            <button class="mode-btn" data-mode="population-order">
                <span class="mode-icon material-icons">bar_chart</span>
                <span class="mode-name">Order by Population</span>
                <span class="mode-desc">Drag countries to order them by population</span>
            </button>
            <button class="mode-btn" data-mode="mystery-flag">
                <span class="mode-icon material-icons">flag</span>
                <span class="mode-name">Mystery Flag</span>
                <span class="mode-desc">See the flag, find the country on the globe</span>
            </button>
            <button class="mode-btn" data-mode="capitals-race">
                <span class="mode-icon material-icons">account_balance</span>
                <span class="mode-name">Capitals Race</span>
                <span class="mode-desc">Type the capital of each highlighted country</span>
            </button>
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
