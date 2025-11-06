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
    maxSubQuestions: 3,
    mode: 'countries', // 'countries', 'us-states', 'indian-states'
    currentDataObj: null, // Will be set based on mode
    currentQuizList: null // Will be set based on mode
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
    'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
];

const usStateData = {
    'Alabama': {
        code: 'us-al',
        capital: 'Montgomery',
        similar: ['Mississippi', 'Georgia', 'Tennessee', 'Florida']
    },
    'Alaska': {
        code: 'us-ak',
        capital: 'Juneau',
        similar: ['Washington', 'Montana', 'Wyoming', 'Hawaii']
    },
    'Arizona': {
        code: 'us-az',
        capital: 'Phoenix',
        similar: ['New Mexico', 'Nevada', 'Utah', 'California']
    },
    'Arkansas': {
        code: 'us-ar',
        capital: 'Little Rock',
        similar: ['Louisiana', 'Missouri', 'Oklahoma', 'Tennessee']
    },
    'California': {
        code: 'us-ca',
        capital: 'Sacramento',
        similar: ['Nevada', 'Oregon', 'Arizona', 'Washington']
    },
    'Colorado': {
        code: 'us-co',
        capital: 'Denver',
        similar: ['Wyoming', 'Utah', 'New Mexico', 'Kansas']
    },
    'Connecticut': {
        code: 'us-ct',
        capital: 'Hartford',
        similar: ['Rhode Island', 'Massachusetts', 'New York', 'New Jersey']
    },
    'Delaware': {
        code: 'us-de',
        capital: 'Dover',
        similar: ['Maryland', 'New Jersey', 'Pennsylvania', 'Rhode Island']
    },
    'Florida': {
        code: 'us-fl',
        capital: 'Tallahassee',
        similar: ['Georgia', 'Alabama', 'Louisiana', 'South Carolina']
    },
    'Georgia': {
        code: 'us-ga',
        capital: 'Atlanta',
        similar: ['Florida', 'South Carolina', 'Alabama', 'Tennessee']
    },
    'Hawaii': {
        code: 'us-hi',
        capital: 'Honolulu',
        similar: ['Alaska', 'California', 'Florida', 'Washington']
    },
    'Idaho': {
        code: 'us-id',
        capital: 'Boise',
        similar: ['Montana', 'Wyoming', 'Utah', 'Washington']
    },
    'Illinois': {
        code: 'us-il',
        capital: 'Springfield',
        similar: ['Indiana', 'Wisconsin', 'Iowa', 'Missouri']
    },
    'Indiana': {
        code: 'us-in',
        capital: 'Indianapolis',
        similar: ['Illinois', 'Ohio', 'Michigan', 'Kentucky']
    },
    'Iowa': {
        code: 'us-ia',
        capital: 'Des Moines',
        similar: ['Nebraska', 'Illinois', 'Missouri', 'Minnesota']
    },
    'Kansas': {
        code: 'us-ks',
        capital: 'Topeka',
        similar: ['Nebraska', 'Oklahoma', 'Missouri', 'Colorado']
    },
    'Kentucky': {
        code: 'us-ky',
        capital: 'Frankfort',
        similar: ['Tennessee', 'Virginia', 'West Virginia', 'Indiana']
    },
    'Louisiana': {
        code: 'us-la',
        capital: 'Baton Rouge',
        similar: ['Texas', 'Arkansas', 'Mississippi', 'Florida']
    },
    'Maine': {
        code: 'us-me',
        capital: 'Augusta',
        similar: ['New Hampshire', 'Vermont', 'Massachusetts', 'New York']
    },
    'Maryland': {
        code: 'us-md',
        capital: 'Annapolis',
        similar: ['Virginia', 'Delaware', 'Pennsylvania', 'West Virginia']
    },
    'Massachusetts': {
        code: 'us-ma',
        capital: 'Boston',
        similar: ['Rhode Island', 'Connecticut', 'New Hampshire', 'Vermont']
    },
    'Michigan': {
        code: 'us-mi',
        capital: 'Lansing',
        similar: ['Wisconsin', 'Ohio', 'Indiana', 'Minnesota']
    },
    'Minnesota': {
        code: 'us-mn',
        capital: 'Saint Paul',
        similar: ['Wisconsin', 'North Dakota', 'South Dakota', 'Iowa']
    },
    'Mississippi': {
        code: 'us-ms',
        capital: 'Jackson',
        similar: ['Alabama', 'Louisiana', 'Tennessee', 'Arkansas']
    },
    'Missouri': {
        code: 'us-mo',
        capital: 'Jefferson City',
        similar: ['Arkansas', 'Illinois', 'Kansas', 'Iowa']
    },
    'Montana': {
        code: 'us-mt',
        capital: 'Helena',
        similar: ['Idaho', 'Wyoming', 'North Dakota', 'South Dakota']
    },
    'Nebraska': {
        code: 'us-ne',
        capital: 'Lincoln',
        similar: ['Kansas', 'Iowa', 'South Dakota', 'Colorado']
    },
    'Nevada': {
        code: 'us-nv',
        capital: 'Carson City',
        similar: ['California', 'Utah', 'Arizona', 'Oregon']
    },
    'New Hampshire': {
        code: 'us-nh',
        capital: 'Concord',
        similar: ['Vermont', 'Maine', 'Massachusetts', 'Rhode Island']
    },
    'New Jersey': {
        code: 'us-nj',
        capital: 'Trenton',
        similar: ['New York', 'Pennsylvania', 'Delaware', 'Connecticut']
    },
    'New Mexico': {
        code: 'us-nm',
        capital: 'Santa Fe',
        similar: ['Arizona', 'Texas', 'Colorado', 'Oklahoma']
    },
    'New York': {
        code: 'us-ny',
        capital: 'Albany',
        similar: ['Pennsylvania', 'New Jersey', 'Massachusetts', 'Connecticut']
    },
    'North Carolina': {
        code: 'us-nc',
        capital: 'Raleigh',
        similar: ['South Carolina', 'Virginia', 'Tennessee', 'Georgia']
    },
    'North Dakota': {
        code: 'us-nd',
        capital: 'Bismarck',
        similar: ['South Dakota', 'Montana', 'Minnesota', 'Nebraska']
    },
    'Ohio': {
        code: 'us-oh',
        capital: 'Columbus',
        similar: ['Pennsylvania', 'Michigan', 'Indiana', 'Kentucky']
    },
    'Oklahoma': {
        code: 'us-ok',
        capital: 'Oklahoma City',
        similar: ['Texas', 'Kansas', 'Arkansas', 'New Mexico']
    },
    'Oregon': {
        code: 'us-or',
        capital: 'Salem',
        similar: ['Washington', 'California', 'Idaho', 'Nevada']
    },
    'Pennsylvania': {
        code: 'us-pa',
        capital: 'Harrisburg',
        similar: ['New York', 'Ohio', 'New Jersey', 'Maryland']
    },
    'Rhode Island': {
        code: 'us-ri',
        capital: 'Providence',
        similar: ['Connecticut', 'Massachusetts', 'New Hampshire', 'Delaware']
    },
    'South Carolina': {
        code: 'us-sc',
        capital: 'Columbia',
        similar: ['North Carolina', 'Georgia', 'Virginia', 'Florida']
    },
    'South Dakota': {
        code: 'us-sd',
        capital: 'Pierre',
        similar: ['North Dakota', 'Nebraska', 'Montana', 'Wyoming']
    },
    'Tennessee': {
        code: 'us-tn',
        capital: 'Nashville',
        similar: ['Kentucky', 'Alabama', 'Mississippi', 'Arkansas']
    },
    'Texas': {
        code: 'us-tx',
        capital: 'Austin',
        similar: ['Oklahoma', 'New Mexico', 'Louisiana', 'Arkansas']
    },
    'Utah': {
        code: 'us-ut',
        capital: 'Salt Lake City',
        similar: ['Nevada', 'Colorado', 'Wyoming', 'Idaho']
    },
    'Vermont': {
        code: 'us-vt',
        capital: 'Montpelier',
        similar: ['New Hampshire', 'New York', 'Massachusetts', 'Maine']
    },
    'Virginia': {
        code: 'us-va',
        capital: 'Richmond',
        similar: ['Maryland', 'North Carolina', 'West Virginia', 'Kentucky']
    },
    'Washington': {
        code: 'us-wa',
        capital: 'Olympia',
        similar: ['Oregon', 'Idaho', 'California', 'Montana']
    },
    'West Virginia': {
        code: 'us-wv',
        capital: 'Charleston',
        similar: ['Virginia', 'Kentucky', 'Ohio', 'Pennsylvania']
    },
    'Wisconsin': {
        code: 'us-wi',
        capital: 'Madison',
        similar: ['Minnesota', 'Michigan', 'Illinois', 'Iowa']
    },
    'Wyoming': {
        code: 'us-wy',
        capital: 'Cheyenne',
        similar: ['Montana', 'Colorado', 'Idaho', 'Utah']
    }
};

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

const indianStateData = {
    'Andhra Pradesh': {
        code: 'in-ap',
        capital: 'Amaravati',
        similar: ['Telangana', 'Karnataka', 'Tamil Nadu', 'Odisha']
    },
    'Arunachal Pradesh': {
        code: 'in-ar',
        capital: 'Itanagar',
        similar: ['Assam', 'Nagaland', 'Manipur', 'Meghalaya']
    },
    'Assam': {
        code: 'in-as',
        capital: 'Dispur',
        similar: ['Meghalaya', 'Arunachal Pradesh', 'Nagaland', 'Mizoram']
    },
    'Bihar': {
        code: 'in-br',
        capital: 'Patna',
        similar: ['Jharkhand', 'Uttar Pradesh', 'West Bengal', 'Madhya Pradesh']
    },
    'Chhattisgarh': {
        code: 'in-ct',
        capital: 'Raipur',
        similar: ['Madhya Pradesh', 'Maharashtra', 'Odisha', 'Jharkhand']
    },
    'Goa': {
        code: 'in-ga',
        capital: 'Panaji',
        similar: ['Maharashtra', 'Karnataka', 'Kerala', 'Tamil Nadu']
    },
    'Gujarat': {
        code: 'in-gj',
        capital: 'Gandhinagar',
        similar: ['Rajasthan', 'Maharashtra', 'Madhya Pradesh', 'Dadra and Nagar Haveli and Daman and Diu']
    },
    'Haryana': {
        code: 'in-hr',
        capital: 'Chandigarh',
        similar: ['Punjab', 'Delhi', 'Uttar Pradesh', 'Rajasthan']
    },
    'Himachal Pradesh': {
        code: 'in-hp',
        capital: 'Shimla',
        similar: ['Punjab', 'Uttarakhand', 'Haryana', 'Jammu and Kashmir']
    },
    'Jharkhand': {
        code: 'in-jh',
        capital: 'Ranchi',
        similar: ['Bihar', 'West Bengal', 'Odisha', 'Chhattisgarh']
    },
    'Karnataka': {
        code: 'in-ka',
        capital: 'Bengaluru',
        similar: ['Maharashtra', 'Goa', 'Kerala', 'Tamil Nadu']
    },
    'Kerala': {
        code: 'in-kl',
        capital: 'Thiruvananthapuram',
        similar: ['Tamil Nadu', 'Karnataka', 'Goa', 'Lakshadweep']
    },
    'Madhya Pradesh': {
        code: 'in-mp',
        capital: 'Bhopal',
        similar: ['Uttar Pradesh', 'Chhattisgarh', 'Maharashtra', 'Rajasthan']
    },
    'Maharashtra': {
        code: 'in-mh',
        capital: 'Mumbai',
        similar: ['Gujarat', 'Madhya Pradesh', 'Karnataka', 'Goa']
    },
    'Manipur': {
        code: 'in-mn',
        capital: 'Imphal',
        similar: ['Nagaland', 'Mizoram', 'Assam', 'Tripura']
    },
    'Meghalaya': {
        code: 'in-ml',
        capital: 'Shillong',
        similar: ['Assam', 'Tripura', 'Mizoram', 'Arunachal Pradesh']
    },
    'Mizoram': {
        code: 'in-mz',
        capital: 'Aizawl',
        similar: ['Manipur', 'Tripura', 'Assam', 'Meghalaya']
    },
    'Nagaland': {
        code: 'in-nl',
        capital: 'Kohima',
        similar: ['Manipur', 'Assam', 'Arunachal Pradesh', 'Mizoram']
    },
    'Odisha': {
        code: 'in-or',
        capital: 'Bhubaneswar',
        similar: ['West Bengal', 'Jharkhand', 'Chhattisgarh', 'Andhra Pradesh']
    },
    'Punjab': {
        code: 'in-pb',
        capital: 'Chandigarh',
        similar: ['Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Rajasthan']
    },
    'Rajasthan': {
        code: 'in-rj',
        capital: 'Jaipur',
        similar: ['Gujarat', 'Madhya Pradesh', 'Uttar Pradesh', 'Haryana']
    },
    'Sikkim': {
        code: 'in-sk',
        capital: 'Gangtok',
        similar: ['West Bengal', 'Assam', 'Arunachal Pradesh', 'Meghalaya']
    },
    'Tamil Nadu': {
        code: 'in-tn',
        capital: 'Chennai',
        similar: ['Kerala', 'Karnataka', 'Andhra Pradesh', 'Puducherry']
    },
    'Telangana': {
        code: 'in-tg',
        capital: 'Hyderabad',
        similar: ['Andhra Pradesh', 'Maharashtra', 'Karnataka', 'Chhattisgarh']
    },
    'Tripura': {
        code: 'in-tr',
        capital: 'Agartala',
        similar: ['Mizoram', 'Assam', 'Meghalaya', 'Manipur']
    },
    'Uttar Pradesh': {
        code: 'in-up',
        capital: 'Lucknow',
        similar: ['Madhya Pradesh', 'Bihar', 'Uttarakhand', 'Haryana']
    },
    'Uttarakhand': {
        code: 'in-ut',
        capital: 'Dehradun',
        similar: ['Uttar Pradesh', 'Himachal Pradesh', 'Haryana', 'Delhi']
    },
    'West Bengal': {
        code: 'in-wb',
        capital: 'Kolkata',
        similar: ['Bihar', 'Jharkhand', 'Odisha', 'Sikkim']
    },
    'Andaman and Nicobar Islands': {
        code: 'in-an',
        capital: 'Port Blair',
        similar: ['Tamil Nadu', 'Kerala', 'West Bengal', 'Lakshadweep']
    },
    'Chandigarh': {
        code: 'in-ch',
        capital: 'Chandigarh',
        similar: ['Punjab', 'Haryana', 'Himachal Pradesh', 'Delhi']
    },
    'Dadra and Nagar Haveli and Daman and Diu': {
        code: 'in-dn',
        capital: 'Daman',
        similar: ['Gujarat', 'Maharashtra', 'Goa', 'Rajasthan']
    },
    'Delhi': {
        code: 'in-dl',
        capital: 'New Delhi',
        similar: ['Haryana', 'Uttar Pradesh', 'Punjab', 'Chandigarh']
    },
    'Jammu and Kashmir': {
        code: 'in-jk',
        capital: 'Srinagar',
        similar: ['Ladakh', 'Himachal Pradesh', 'Punjab', 'Uttarakhand']
    },
    'Ladakh': {
        code: 'in-la',
        capital: 'Leh',
        similar: ['Jammu and Kashmir', 'Himachal Pradesh', 'Uttarakhand', 'Sikkim']
    },
    'Lakshadweep': {
        code: 'in-ld',
        capital: 'Kavaratti',
        similar: ['Kerala', 'Goa', 'Tamil Nadu', 'Andaman and Nicobar Islands']
    },
    'Puducherry': {
        code: 'in-py',
        capital: 'Puducherry',
        similar: ['Tamil Nadu', 'Kerala', 'Karnataka', 'Andhra Pradesh']
    }
};

// Quiz mode configurations
const QUIZ_MODES = {
    countries: {
        name: 'Countries of the World',
        quizList: quizCountries,
        dataObj: countryData,
        totalQuestions: 10,
        useGlobe: true,
        mapUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
        mapObject: 'countries',
        hasFlags: true,
        itemLabel: 'country',
        itemLabelPlural: 'countries'
    },
    'us-states': {
        name: 'US States',
        quizList: usStates,
        dataObj: usStateData,
        totalQuestions: 10,
        useGlobe: false,
        mapUrl: 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json',
        mapObject: 'states',
        hasFlags: false,
        itemLabel: 'state',
        itemLabelPlural: 'states'
    },
    'indian-states': {
        name: 'Indian States',
        quizList: indianStates,
        dataObj: indianStateData,
        totalQuestions: 10,
        useGlobe: false,
        mapUrl: 'https://raw.githubusercontent.com/Subhash9325/GeoJson-Data-of-Indian-States/master/Indian_States',
        mapObject: null, // Will use features directly
        hasFlags: false,
        itemLabel: 'state',
        itemLabelPlural: 'states'
    }
};

// Helper function to get flag URL for a country
function getFlagUrl(itemName) {
    const data = gameState.currentDataObj[itemName];
    if (!data) return null;
    return `https://flagcdn.com/${data.code}.svg`;
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

    options.forEach(option => {
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.textContent = option;
        button.onclick = () => handleMultipleChoiceAnswer(option, correctAnswer, button);
        container.appendChild(button);
    });

    // Show multiple choice container and hide globe for MC questions
    document.getElementById('multiple-choice-container').classList.remove('hidden');
    if (gameState.questionType !== 'location') {
        document.getElementById('globe-container').classList.add('hidden');
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
    document.getElementById('multiple-choice-container').classList.add('hidden');
    document.getElementById('globe-container').classList.remove('hidden');
    document.getElementById('flag-display').style.display = 'none';
}

// Initialize the game
function initGame() {
    setupEventListeners();
}

// Start game with selected mode
function startGameWithMode(mode) {
    gameState.mode = mode;
    const modeConfig = QUIZ_MODES[mode];

    // Set current data sources
    gameState.currentDataObj = modeConfig.dataObj;
    gameState.currentQuizList = modeConfig.quizList;

    // Hide mode selector and show game elements
    document.getElementById('mode-selector').classList.add('hidden');
    document.getElementById('game-info').classList.remove('hidden');
    document.getElementById('question-container').classList.remove('hidden');
    document.getElementById('controls').classList.remove('hidden');
    document.getElementById('instructions').classList.remove('hidden');

    // Setup visualization based on mode
    setupGlobe();
    loadMapData();
}

// Set up the globe SVG and projection
function setupGlobe() {
    const modeConfig = QUIZ_MODES[gameState.mode];

    svg = d3.select('#globe')
        .attr('width', width)
        .attr('height', height);

    if (modeConfig.useGlobe) {
        // Orthographic projection for globe view
        projection = d3.geoOrthographic()
            .scale(280)
            .translate([width / 2, height / 2])
            .clipAngle(90);
    } else {
        // Mercator projection for regional maps
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

    // Add drag behavior
    const drag = d3.drag()
        .on('start', dragStart)
        .on('drag', dragging)
        .on('end', dragEnd);

    svg.call(drag);
}

// Load map data based on current mode
function loadMapData() {
    const modeConfig = QUIZ_MODES[gameState.mode];

    d3.json(modeConfig.mapUrl)
        .then(data => {
            if (gameState.mode === 'countries') {
                gameState.countries = topojson.feature(data, data.objects.countries).features;

                // Add country names
                gameState.countries.forEach(country => {
                    country.properties.name = getCountryName(country.id);
                });
            } else if (gameState.mode === 'us-states') {
                gameState.countries = topojson.feature(data, data.objects.states).features;

                // Map state IDs to names
                gameState.countries.forEach(state => {
                    state.properties.name = getStateName(state.id);
                });

                // Fit projection to US
                projection.fitSize([width, height], {
                    type: 'FeatureCollection',
                    features: gameState.countries
                });
            } else if (gameState.mode === 'indian-states') {
                // For Indian states, the data is already in GeoJSON format
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
                    }
                });

                // Fit projection to India
                projection.fitSize([width, height], {
                    type: 'FeatureCollection',
                    features: gameState.countries
                });
            }

            drawCountries();
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
        51: 'Virginia', 53: 'Washington', 54: 'West Virginia', 55: 'Wisconsin', 56: 'Wyoming'
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

    // Determine max sub-questions based on mode (2 if no flags, 3 if flags)
    const modeConfig = QUIZ_MODES[gameState.mode];
    const maxSub = modeConfig.hasFlags ? 3 : 2;

    // Auto-advance to next sub-question or enable next button
    if (gameState.subQuestionIndex < maxSub - 1) {
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

        // Randomly decide question type for this item (70% normal, 30% identify mode)
        if (Math.random() < 0.3) {
            gameState.questionType = 'identify';
        } else {
            gameState.questionType = 'location';
        }
    }

    // Update question number display
    document.getElementById('current-question').textContent = gameState.currentQuestion;

    // Render the appropriate question based on subQuestionIndex
    const modeConfig = QUIZ_MODES[gameState.mode];
    const hasFlags = modeConfig.hasFlags;

    if (gameState.questionType === 'identify' && gameState.subQuestionIndex === 0) {
        renderIdentifyQuestion();
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
    const itemLabel = QUIZ_MODES[gameState.mode].itemLabel;
    document.getElementById('question-text').innerHTML = `Find: <span id="country-name">${gameState.targetCountry}</span>`;
    document.getElementById('globe-container').classList.remove('hidden');
    document.getElementById('multiple-choice-container').classList.add('hidden');
    document.getElementById('flag-display').style.display = 'none';

    // Rotate globe/map to show the target
    if (QUIZ_MODES[gameState.mode].useGlobe) {
        rotateToCountry(gameState.targetCountry);
    } else {
        // For regional maps, just ensure it's visible (already fitted in loadMapData)
    }
}

// Render flag question (identify the flag)
function renderFlagQuestion() {
    gameState.questionType = 'flag';
    const flagUrl = getFlagUrl(gameState.targetCountry);
    const itemLabel = QUIZ_MODES[gameState.mode].itemLabel;

    document.getElementById('question-text').innerHTML = `Which ${itemLabel} does this flag belong to?`;
    document.getElementById('flag-display').style.display = 'block';
    document.getElementById('flag-image').src = flagUrl;
    document.getElementById('globe-container').classList.add('hidden');

    // Generate multiple choice options
    const options = generateMultipleChoiceOptions(gameState.targetCountry, 'item');
    renderMultipleChoice(options, gameState.targetCountry);
}

// Render capital question
function renderCapitalQuestion() {
    gameState.questionType = 'capital';
    const correctCapital = getCapital(gameState.targetCountry);

    document.getElementById('question-text').innerHTML = `What is the capital of <span id="country-name">${gameState.targetCountry}</span>?`;
    document.getElementById('flag-display').style.display = 'none';
    document.getElementById('globe-container').classList.add('hidden');

    // Generate multiple choice options with capitals
    const itemOptions = generateMultipleChoiceOptions(gameState.targetCountry, 'item');
    const capitalOptions = itemOptions.map(item => getCapital(item)).filter(cap => cap !== null);

    renderMultipleChoice(capitalOptions, correctCapital);
}

// Render identify question (show country/state on map, identify name)
function renderIdentifyQuestion() {
    gameState.questionType = 'identify';
    const itemLabel = QUIZ_MODES[gameState.mode].itemLabel;
    document.getElementById('question-text').innerHTML = `Which ${itemLabel} is highlighted?`;
    document.getElementById('globe-container').classList.remove('hidden');
    document.getElementById('flag-display').style.display = 'none';

    // Highlight the item on the map
    highlightCountryOnGlobe(gameState.targetCountry);

    // Rotate globe/map to show the target
    if (QUIZ_MODES[gameState.mode].useGlobe) {
        rotateToCountry(gameState.targetCountry);
    }

    // Generate multiple choice options
    const options = generateMultipleChoiceOptions(gameState.targetCountry, 'item');
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
    const modeConfig = QUIZ_MODES[gameState.mode];
    const maxSub = modeConfig.hasFlags ? 3 : 2;
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

    gameState = {
        score: 0,
        currentQuestion: 1,
        totalQuestions: 10,
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

    document.getElementById('score').textContent = '0';
    document.getElementById('current-question').textContent = '1';

    startNewQuestion();
}

// Event listeners
function setupEventListeners() {
    // Mode selection
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mode = e.currentTarget.dataset.mode;
            startGameWithMode(mode);
        });
    });

    document.getElementById('next-btn').addEventListener('click', () => {
        // Reset sub-question index and move to next item
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
