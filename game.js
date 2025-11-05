// Game state
let gameState = {
    score: 0,
    currentQuestion: 1,
    totalQuestions: 10,
    targetCountry: null,
    countries: [],
    answeredCorrectly: false,
    usedCountries: new Set(),
    questionType: null, // 'location', 'flag', 'capital', 'identify'
    currentAnswer: null,
    multipleChoiceOptions: [],
    subQuestionIndex: 0, // 0: location, 1: flag, 2: capital
    maxSubQuestions: 3
};

// Globe configuration
const width = 800;
const height = 600;
let projection, path, svg, g, countriesGroup;
let rotation = { x: 0, y: 0 };

// List of countries for the quiz (common, recognizable countries)
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
    'Jamaica', 'Panama', 'Costa Rica', 'Dominican Republic', 'Guatemala'
];

// Enhanced country data with capitals, flags, and similar countries for tricky distractors
const countryData = {
    'United States of America': {
        code: 'us',
        capital: 'Washington, D.C.',
        similar: ['Canada', 'Brazil', 'Australia', 'Russia']
    },
    'Canada': {
        code: 'ca',
        capital: 'Ottawa',
        similar: ['United States of America', 'Russia', 'Australia', 'Brazil']
    },
    'Mexico': {
        code: 'mx',
        capital: 'Mexico City',
        similar: ['Colombia', 'Venezuela', 'Guatemala', 'Peru']
    },
    'Brazil': {
        code: 'br',
        capital: 'Brasília',
        similar: ['Argentina', 'Colombia', 'Venezuela', 'Peru']
    },
    'Argentina': {
        code: 'ar',
        capital: 'Buenos Aires',
        similar: ['Chile', 'Uruguay', 'Brazil', 'Paraguay']
    },
    'United Kingdom': {
        code: 'gb',
        capital: 'London',
        similar: ['Ireland', 'Netherlands', 'Belgium', 'France']
    },
    'France': {
        code: 'fr',
        capital: 'Paris',
        similar: ['Belgium', 'Switzerland', 'Spain', 'Italy']
    },
    'Germany': {
        code: 'de',
        capital: 'Berlin',
        similar: ['Poland', 'Austria', 'Netherlands', 'Czechia']
    },
    'Spain': {
        code: 'es',
        capital: 'Madrid',
        similar: ['Portugal', 'Italy', 'France', 'Morocco']
    },
    'Italy': {
        code: 'it',
        capital: 'Rome',
        similar: ['Greece', 'Spain', 'Croatia', 'France']
    },
    'Russia': {
        code: 'ru',
        capital: 'Moscow',
        similar: ['Ukraine', 'Kazakhstan', 'Belarus', 'Poland']
    },
    'China': {
        code: 'cn',
        capital: 'Beijing',
        similar: ['Japan', 'South Korea', 'Mongolia', 'India']
    },
    'Japan': {
        code: 'jp',
        capital: 'Tokyo',
        similar: ['South Korea', 'China', 'Philippines', 'Taiwan']
    },
    'India': {
        code: 'in',
        capital: 'New Delhi',
        similar: ['Pakistan', 'Bangladesh', 'Nepal', 'Sri Lanka']
    },
    'Australia': {
        code: 'au',
        capital: 'Canberra',
        similar: ['New Zealand', 'Indonesia', 'Papua New Guinea', 'United States of America']
    },
    'South Africa': {
        code: 'za',
        capital: 'Pretoria',
        similar: ['Namibia', 'Botswana', 'Zimbabwe', 'Mozambique']
    },
    'Egypt': {
        code: 'eg',
        capital: 'Cairo',
        similar: ['Libya', 'Sudan', 'Saudi Arabia', 'Jordan']
    },
    'Nigeria': {
        code: 'ng',
        capital: 'Abuja',
        similar: ['Ghana', 'Cameroon', 'Niger', 'Benin']
    },
    'Saudi Arabia': {
        code: 'sa',
        capital: 'Riyadh',
        similar: ['Yemen', 'Oman', 'Jordan', 'United Arab Emirates']
    },
    'Turkey': {
        code: 'tr',
        capital: 'Ankara',
        similar: ['Greece', 'Iran', 'Syria', 'Iraq']
    },
    'Greece': {
        code: 'gr',
        capital: 'Athens',
        similar: ['Turkey', 'Bulgaria', 'Italy', 'Albania']
    },
    'Norway': {
        code: 'no',
        capital: 'Oslo',
        similar: ['Sweden', 'Finland', 'Denmark', 'Iceland']
    },
    'Sweden': {
        code: 'se',
        capital: 'Stockholm',
        similar: ['Norway', 'Finland', 'Denmark', 'Poland']
    },
    'Poland': {
        code: 'pl',
        capital: 'Warsaw',
        similar: ['Germany', 'Ukraine', 'Belarus', 'Czechia']
    },
    'Ukraine': {
        code: 'ua',
        capital: 'Kyiv',
        similar: ['Poland', 'Russia', 'Belarus', 'Romania']
    },
    'South Korea': {
        code: 'kr',
        capital: 'Seoul',
        similar: ['North Korea', 'Japan', 'China', 'Taiwan']
    },
    'Thailand': {
        code: 'th',
        capital: 'Bangkok',
        similar: ['Myanmar', 'Vietnam', 'Cambodia', 'Laos']
    },
    'Vietnam': {
        code: 'vn',
        capital: 'Hanoi',
        similar: ['Cambodia', 'Laos', 'Thailand', 'China']
    },
    'Indonesia': {
        code: 'id',
        capital: 'Jakarta',
        similar: ['Malaysia', 'Philippines', 'Papua New Guinea', 'Thailand']
    },
    'Philippines': {
        code: 'ph',
        capital: 'Manila',
        similar: ['Indonesia', 'Malaysia', 'Vietnam', 'Taiwan']
    },
    'New Zealand': {
        code: 'nz',
        capital: 'Wellington',
        similar: ['Australia', 'Fiji', 'Papua New Guinea', 'United Kingdom']
    },
    'Chile': {
        code: 'cl',
        capital: 'Santiago',
        similar: ['Argentina', 'Peru', 'Bolivia', 'Uruguay']
    },
    'Peru': {
        code: 'pe',
        capital: 'Lima',
        similar: ['Ecuador', 'Colombia', 'Bolivia', 'Chile']
    },
    'Colombia': {
        code: 'co',
        capital: 'Bogotá',
        similar: ['Venezuela', 'Ecuador', 'Peru', 'Panama']
    },
    'Venezuela': {
        code: 've',
        capital: 'Caracas',
        similar: ['Colombia', 'Guyana', 'Trinidad and Tobago', 'Brazil']
    },
    'Portugal': {
        code: 'pt',
        capital: 'Lisbon',
        similar: ['Spain', 'Brazil', 'Morocco', 'Italy']
    },
    'Netherlands': {
        code: 'nl',
        capital: 'Amsterdam',
        similar: ['Belgium', 'Germany', 'Denmark', 'United Kingdom']
    },
    'Belgium': {
        code: 'be',
        capital: 'Brussels',
        similar: ['Netherlands', 'Luxembourg', 'France', 'Germany']
    },
    'Switzerland': {
        code: 'ch',
        capital: 'Bern',
        similar: ['Austria', 'Liechtenstein', 'Germany', 'Italy']
    },
    'Austria': {
        code: 'at',
        capital: 'Vienna',
        similar: ['Switzerland', 'Germany', 'Hungary', 'Czechia']
    },
    'Denmark': {
        code: 'dk',
        capital: 'Copenhagen',
        similar: ['Sweden', 'Norway', 'Netherlands', 'Germany']
    },
    'Finland': {
        code: 'fi',
        capital: 'Helsinki',
        similar: ['Sweden', 'Norway', 'Estonia', 'Russia']
    },
    'Ireland': {
        code: 'ie',
        capital: 'Dublin',
        similar: ['United Kingdom', 'Iceland', 'Norway', 'Scotland']
    },
    'Iceland': {
        code: 'is',
        capital: 'Reykjavik',
        similar: ['Norway', 'Greenland', 'Ireland', 'Faroe Islands']
    },
    'Morocco': {
        code: 'ma',
        capital: 'Rabat',
        similar: ['Algeria', 'Tunisia', 'Spain', 'Mauritania']
    },
    'Algeria': {
        code: 'dz',
        capital: 'Algiers',
        similar: ['Morocco', 'Tunisia', 'Libya', 'Mali']
    },
    'Kenya': {
        code: 'ke',
        capital: 'Nairobi',
        similar: ['Tanzania', 'Uganda', 'Ethiopia', 'Somalia']
    },
    'Ethiopia': {
        code: 'et',
        capital: 'Addis Ababa',
        similar: ['Kenya', 'Somalia', 'Eritrea', 'Sudan']
    },
    'Iran': {
        code: 'ir',
        capital: 'Tehran',
        similar: ['Iraq', 'Afghanistan', 'Pakistan', 'Turkey']
    },
    'Iraq': {
        code: 'iq',
        capital: 'Baghdad',
        similar: ['Iran', 'Syria', 'Jordan', 'Kuwait']
    },
    'Pakistan': {
        code: 'pk',
        capital: 'Islamabad',
        similar: ['India', 'Afghanistan', 'Iran', 'Bangladesh']
    },
    'Bangladesh': {
        code: 'bd',
        capital: 'Dhaka',
        similar: ['India', 'Myanmar', 'Pakistan', 'Nepal']
    },
    'Myanmar': {
        code: 'mm',
        capital: 'Naypyidaw',
        similar: ['Thailand', 'Bangladesh', 'Laos', 'India']
    },
    'Malaysia': {
        code: 'my',
        capital: 'Kuala Lumpur',
        similar: ['Indonesia', 'Thailand', 'Singapore', 'Brunei']
    },
    'Singapore': {
        code: 'sg',
        capital: 'Singapore',
        similar: ['Malaysia', 'Indonesia', 'Brunei', 'Hong Kong']
    },
    'Cuba': {
        code: 'cu',
        capital: 'Havana',
        similar: ['Jamaica', 'Dominican Republic', 'Haiti', 'Bahamas']
    },
    'Jamaica': {
        code: 'jm',
        capital: 'Kingston',
        similar: ['Cuba', 'Haiti', 'Dominican Republic', 'Bahamas']
    },
    'Panama': {
        code: 'pa',
        capital: 'Panama City',
        similar: ['Costa Rica', 'Colombia', 'Nicaragua', 'Guatemala']
    },
    'Costa Rica': {
        code: 'cr',
        capital: 'San José',
        similar: ['Panama', 'Nicaragua', 'Guatemala', 'Honduras']
    },
    'Dominican Republic': {
        code: 'do',
        capital: 'Santo Domingo',
        similar: ['Haiti', 'Cuba', 'Jamaica', 'Puerto Rico']
    },
    'Guatemala': {
        code: 'gt',
        capital: 'Guatemala City',
        similar: ['Mexico', 'Honduras', 'El Salvador', 'Belize']
    }
};

// Helper function to get flag URL for a country
function getFlagUrl(countryName) {
    const data = countryData[countryName];
    if (!data) return null;
    return `https://flagcdn.com/${data.code}.svg`;
}

// Helper function to get capital for a country
function getCapital(countryName) {
    const data = countryData[countryName];
    return data ? data.capital : null;
}

// Generate multiple choice options with tricky distractors
function generateMultipleChoiceOptions(correctAnswer, answerType = 'country') {
    const options = [correctAnswer];
    const data = countryData[correctAnswer];

    // Get similar countries for tricky distractors
    let similarCountries = [];
    if (data && data.similar) {
        similarCountries = data.similar.filter(country => {
            // Ensure the similar country is in our quiz countries list
            return quizCountries.includes(country);
        });
    }

    // Add at least one similar country if available
    if (similarCountries.length > 0) {
        const randomSimilar = similarCountries[Math.floor(Math.random() * similarCountries.length)];
        options.push(randomSimilar);
    }

    // Fill remaining options with random countries
    while (options.length < 4) {
        const randomCountry = quizCountries[Math.floor(Math.random() * quizCountries.length)];
        if (!options.includes(randomCountry)) {
            options.push(randomCountry);
        }
    }

    // For capital questions, return the capitals instead of country names
    if (answerType === 'capital') {
        return options.map(country => getCapital(country)).filter(cap => cap !== null);
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

    options.forEach(option => {
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.textContent = option;
        button.onclick = () => handleMultipleChoiceAnswer(option, correctAnswer, button);
        container.appendChild(button);
    });

    // Show multiple choice container and hide globe for MC questions
    document.getElementById('multiple-choice-container').style.display = 'block';
    if (gameState.questionType !== 'location') {
        document.getElementById('globe-container').style.display = 'none';
    }
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
        // Show correct answer after delay
        setTimeout(() => {
            const buttons = document.querySelectorAll('.option-btn');
            buttons.forEach(btn => {
                if (btn.textContent === correctAnswer) {
                    btn.classList.add('correct');
                }
            });
        }, 1000);
    }
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
    document.getElementById('options-grid').innerHTML = '';
    document.getElementById('multiple-choice-container').style.display = 'none';
    document.getElementById('globe-container').style.display = 'block';
    document.getElementById('flag-display').style.display = 'none';
}

// Initialize the game
function initGame() {
    setupGlobe();
    loadWorldData();
    setupEventListeners();
}

// Set up the globe SVG and projection
function setupGlobe() {
    svg = d3.select('#globe')
        .attr('width', width)
        .attr('height', height);

    projection = d3.geoOrthographic()
        .scale(280)
        .translate([width / 2, height / 2])
        .clipAngle(90);

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

    // Draw ocean
    g.append('circle')
        .attr('cx', width / 2)
        .attr('cy', height / 2)
        .attr('r', projection.scale())
        .attr('fill', 'url(#ocean-gradient)')
        .attr('stroke', '#1e3a5f')
        .attr('stroke-width', 2);

    // Group for countries
    countriesGroup = g.append('g');

    // Add drag behavior
    const drag = d3.drag()
        .on('start', dragStart)
        .on('drag', dragging)
        .on('end', dragEnd);

    svg.call(drag);
}

// Load world map data
function loadWorldData() {
    // Using natural earth data from D3's public CDN
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
        .then(world => {
            gameState.countries = topojson.feature(world, world.objects.countries).features;

            // Add country names
            gameState.countries.forEach(country => {
                country.properties.name = getCountryName(country.id);
            });

            drawCountries();
            startNewQuestion();
        })
        .catch(error => {
            console.error('Error loading map data:', error);
            document.getElementById('country-name').textContent = 'Error loading map data';
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

// Handle country click
function handleCountryClick(event, d) {
    // Only allow clicking countries during location questions
    if (gameState.questionType !== 'location') return;
    if (gameState.answeredCorrectly) return;

    const clickedCountry = d.properties.name;
    const isCorrect = clickedCountry === gameState.targetCountry;

    // Visual feedback
    d3.select(event.target).classed('selected', true);

    if (isCorrect) {
        handleCorrectAnswer(event.target);
    } else {
        handleIncorrectAnswer(event.target);
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
    document.getElementById('score').textContent = gameState.score;

    const feedback = document.getElementById('feedback');
    feedback.textContent = '✓ Correct! Well done!';
    feedback.className = 'feedback correct';

    // Auto-advance to next sub-question or enable next button
    if (gameState.subQuestionIndex < gameState.maxSubQuestions - 1) {
        // Automatically move to next sub-question after a short delay
        setTimeout(() => {
            gameState.subQuestionIndex++;
            startNewQuestion();
        }, 1500);
    } else {
        // All sub-questions complete, enable next question button
        document.getElementById('next-btn').disabled = false;
    }
}

// Handle incorrect answer
function handleIncorrectAnswer(element) {
    d3.select(element).classed('selected', false).classed('incorrect', true);

    const feedback = document.getElementById('feedback');
    feedback.textContent = '✗ Incorrect. Try again!';
    feedback.className = 'feedback incorrect';

    // Remove incorrect styling after a short delay
    setTimeout(() => {
        d3.select(element).classed('incorrect', false);
        feedback.textContent = '';
        feedback.className = 'feedback';
    }, 1500);
}

// Start a new question
function startNewQuestion() {
    // Reset state
    gameState.answeredCorrectly = false;
    document.getElementById('next-btn').disabled = true;

    // Clear feedback
    const feedback = document.getElementById('feedback');
    feedback.textContent = '';
    feedback.className = 'feedback';

    // Clear previous styling
    countriesGroup.selectAll('path')
        .classed('target', false)
        .classed('selected', false)
        .classed('incorrect', false);

    // Clear multiple choice
    clearMultipleChoice();

    // Check if game is over
    if (gameState.currentQuestion > gameState.totalQuestions) {
        endGame();
        return;
    }

    // If starting a new country (subQuestionIndex === 0), select a new country
    if (gameState.subQuestionIndex === 0) {
        // Get available countries that haven't been used
        const availableCountries = quizCountries.filter(country => {
            // Check if country exists in our data and hasn't been used
            const exists = gameState.countries.some(c => c.properties.name === country);
            return exists && !gameState.usedCountries.has(country);
        });

        if (availableCountries.length === 0) {
            // Reset used countries if we've gone through all of them
            gameState.usedCountries.clear();
            startNewQuestion();
            return;
        }

        // Select random country
        const randomIndex = Math.floor(Math.random() * availableCountries.length);
        gameState.targetCountry = availableCountries[randomIndex];
        gameState.usedCountries.add(gameState.targetCountry);

        // Randomly decide question type for this country (70% normal, 30% identify mode)
        if (Math.random() < 0.3) {
            gameState.questionType = 'identify';
        } else {
            gameState.questionType = 'location';
        }
    }

    // Update question number display
    document.getElementById('current-question').textContent = gameState.currentQuestion;

    // Render the appropriate question based on subQuestionIndex
    if (gameState.questionType === 'identify' && gameState.subQuestionIndex === 0) {
        renderIdentifyQuestion();
    } else if (gameState.subQuestionIndex === 0) {
        renderLocationQuestion();
    } else if (gameState.subQuestionIndex === 1) {
        renderFlagQuestion();
    } else if (gameState.subQuestionIndex === 2) {
        renderCapitalQuestion();
    }
}

// Render location question (original: find country on globe)
function renderLocationQuestion() {
    gameState.questionType = 'location';
    document.getElementById('question-text').innerHTML = `Find: <span id="country-name">${gameState.targetCountry}</span>`;
    document.getElementById('globe-container').style.display = 'block';
    document.getElementById('multiple-choice-container').style.display = 'none';
    document.getElementById('flag-display').style.display = 'none';

    // Rotate globe to show the target country
    rotateToCountry(gameState.targetCountry);
}

// Render flag question (identify the flag)
function renderFlagQuestion() {
    gameState.questionType = 'flag';
    const flagUrl = getFlagUrl(gameState.targetCountry);

    document.getElementById('question-text').innerHTML = `Which country does this flag belong to?`;
    document.getElementById('flag-display').style.display = 'block';
    document.getElementById('flag-image').src = flagUrl;
    document.getElementById('globe-container').style.display = 'none';

    // Generate multiple choice options
    const options = generateMultipleChoiceOptions(gameState.targetCountry, 'country');
    renderMultipleChoice(options, gameState.targetCountry);
}

// Render capital question
function renderCapitalQuestion() {
    gameState.questionType = 'capital';
    const correctCapital = getCapital(gameState.targetCountry);

    document.getElementById('question-text').innerHTML = `What is the capital of <span id="country-name">${gameState.targetCountry}</span>?`;
    document.getElementById('flag-display').style.display = 'none';
    document.getElementById('globe-container').style.display = 'none';

    // Generate multiple choice options with capitals
    const countryOptions = generateMultipleChoiceOptions(gameState.targetCountry, 'country');
    const capitalOptions = countryOptions.map(country => getCapital(country)).filter(cap => cap !== null);

    renderMultipleChoice(capitalOptions, correctCapital);
}

// Render identify question (show country on globe, identify name)
function renderIdentifyQuestion() {
    gameState.questionType = 'identify';
    document.getElementById('question-text').innerHTML = `Which country is highlighted?`;
    document.getElementById('globe-container').style.display = 'block';
    document.getElementById('flag-display').style.display = 'none';

    // Highlight the country on the globe
    highlightCountryOnGlobe(gameState.targetCountry);

    // Rotate globe to show the target country
    rotateToCountry(gameState.targetCountry);

    // Generate multiple choice options
    const options = generateMultipleChoiceOptions(gameState.targetCountry, 'country');
    renderMultipleChoice(options, gameState.targetCountry);
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
        });
}

// Drag functions
let isDragging = false;
let dragStartPos = null;

function dragStart(event) {
    isDragging = true;
    dragStartPos = { x: event.x, y: event.y };
    rotation = { x: projection.rotate()[0], y: projection.rotate()[1] };
}

function dragging(event) {
    if (!isDragging) return;

    const dx = event.x - dragStartPos.x;
    const dy = event.y - dragStartPos.y;

    const newRotation = [
        rotation.x + dx * 0.5,
        rotation.y - dy * 0.5
    ];

    // Clamp latitude rotation
    newRotation[1] = Math.max(-90, Math.min(90, newRotation[1]));

    projection.rotate(newRotation);
    countriesGroup.selectAll('path').attr('d', path);
}

function dragEnd() {
    isDragging = false;
}

// End game
function endGame() {
    const maxScore = gameState.totalQuestions * gameState.maxSubQuestions;
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
    gameState = {
        score: 0,
        currentQuestion: 1,
        totalQuestions: 10,
        targetCountry: null,
        countries: gameState.countries, // Keep loaded countries
        answeredCorrectly: false,
        usedCountries: new Set(),
        questionType: null,
        currentAnswer: null,
        multipleChoiceOptions: [],
        subQuestionIndex: 0,
        maxSubQuestions: 3
    };

    document.getElementById('score').textContent = '0';
    document.getElementById('current-question').textContent = '1';

    startNewQuestion();
}

// Event listeners
function setupEventListeners() {
    document.getElementById('next-btn').addEventListener('click', () => {
        // Reset sub-question index and move to next country
        gameState.subQuestionIndex = 0;
        gameState.currentQuestion++;
        startNewQuestion();
    });

    document.getElementById('restart-btn').addEventListener('click', restartGame);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
