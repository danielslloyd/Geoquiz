#!/usr/bin/env node

/**
 * Add alternate acceptable names to country/state data
 * This allows players to type alternate names in "name-all" mode
 */

const fs = require('fs');
const path = require('path');

// Define alternate names for countries
const countryAltNames = {
  'United States of America': ['USA', 'US', 'United States', 'America'],
  'United Kingdom': ['UK', 'Great Britain', 'Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
  'Czechia': ['Czech Republic'],
  'South Korea': ['Korea', 'South Korea', 'SK', 'Korea South'],
  'North Korea': ['Korea North', 'Democratic People\'s Republic of Korea', 'DPRK'],
  'Vietnam': ['Viet Nam'],
  'Iran': ['Persia'],
  'Turkey': ['Türkiye'],
  'Netherlands': ['Holland', 'The Netherlands'],
  'Democratic Republic of the Congo': ['DRC', 'Congo', 'Congo Kinshasa'],
  'Republic of the Congo': ['Congo', 'Congo Brazzaville'],
  'East Timor': ['Timor-Leste', 'Timor Leste'],
  'Myanmar': ['Burma'],
  'Taiwan': ['Chinese Taipei', 'Taipei'],
  'Palestine': ['Palestinian Territories', 'State of Palestine'],
  'Eswatini': ['Swaziland'],
  'Aland Islands': ['Åland Islands', 'Åland', 'Aland'],
  'Curacao': ['Curaçao'],
  'Reunion': ['Réunion', 'Reunion'],
  'Saint Barthelemy': ['Saint Barthélemy'],
  'Saint Martin': ['Sint Maarten'],
  'Bosnia and Herzegovina': ['Bosnia', 'Bosnia-Herzegovina'],
  'New Zealand': ['Aotearoa', 'NZ'],
  'United Arab Emirates': ['UAE'],
  'Saudi Arabia': ['Saudi Arabia'],
  'Ivory Coast': ['Côte d\'Ivoire', 'Cote d\'Ivoire'],
  'Papua New Guinea': ['PNG'],
  'Saint Kitts and Nevis': ['St. Kitts and Nevis'],
  'Saint Lucia': ['St. Lucia'],
  'Saint Vincent and the Grenadines': ['St. Vincent and the Grenadines'],
  'Trinidad and Tobago': ['Trinidad'],
  'Antigua and Barbuda': ['Antigua'],
  'Sao Tome and Principe': ['São Tomé and Príncipe']
};

// Define alternate names for US states
const usStateAltNames = {
  'District of Columbia': ['Washington D.C.', 'Washington DC', 'DC', 'Washington'],
  'New York': ['NY'],
  'California': ['CA'],
  'Texas': ['TX'],
  'Florida': ['FL'],
  'Pennsylvania': ['PA'],
  'Illinois': ['IL'],
  'Ohio': ['OH'],
  'Georgia': ['GA'],
  'North Carolina': ['NC'],
  'Michigan': ['MI'],
  'New Jersey': ['NJ'],
  'Virginia': ['VA'],
  'Washington': ['WA'],
  'Arizona': ['AZ'],
  'Massachusetts': ['MA'],
  'Tennessee': ['TN'],
  'Indiana': ['IN'],
  'Maryland': ['MD'],
  'Missouri': ['MO'],
  'Wisconsin': ['WI'],
  'Colorado': ['CO'],
  'Minnesota': ['MN'],
  'South Carolina': ['SC'],
  'Alabama': ['AL'],
  'Louisiana': ['LA'],
  'Kentucky': ['KY'],
  'Oregon': ['OR'],
  'Oklahoma': ['OK'],
  'Connecticut': ['CT'],
  'Utah': ['UT'],
  'Iowa': ['IA'],
  'Nevada': ['NV'],
  'Arkansas': ['AR'],
  'Kansas': ['KS'],
  'Mississippi': ['MS'],
  'New Mexico': ['NM'],
  'Nebraska': ['NE'],
  'Idaho': ['ID'],
  'Hawaii': ['HI'],
  'New Hampshire': ['NH'],
  'Maine': ['ME'],
  'Montana': ['MT'],
  'Rhode Island': ['RI'],
  'Delaware': ['DE'],
  'South Dakota': ['SD'],
  'North Dakota': ['ND'],
  'Alaska': ['AK'],
  'Vermont': ['VT'],
  'Wyoming': ['WY'],
  'West Virginia': ['WV'],
  'Puerto Rico': ['PR'],
  'United States Virgin Islands': ['Virgin Islands', 'USVI', 'US Virgin Islands']
};

// Define alternate names for Indian states
const indianStateAltNames = {
  'Arunachal Pradesh': [],
  'Himachal Pradesh': [],
  'Uttarakhand': ['Uttaranchal'],
  'Haryana': [],
  'Punjab': [],
  'Jammu and Kashmir': ['J&K', 'Jammu Kashmir'],
  'Ladakh': [],
  'Telangana': [],
  'Andhra Pradesh': [],
  'Karnataka': [],
  'Tamil Nadu': [],
  'Kerala': [],
  'Puducherry': ['Pondicherry'],
  'Andaman and Nicobar Islands': ['Andaman'],
  'Lakshadweep': [],
  'Daman and Diu': [],
  'Dadra and Nagar Haveli': ['Dadra Nagar Haveli'],
  'Gujarat': [],
  'Maharashtra': [],
  'Goa': [],
  'Chhattisgarh': [],
  'Madhya Pradesh': [],
  'Rajasthan': [],
  'Uttar Pradesh': ['UP'],
  'Bihar': [],
  'Jharkhand': [],
  'West Bengal': ['Bengal'],
  'Odisha': ['Orissa'],
  'Assam': [],
  'Meghalaya': [],
  'Mizoram': [],
  'Manipur': [],
  'Nagaland': [],
  'Sikkim': [],
  'Tripura': []
};

// Define alternate names for German states
const germanStateAltNames = {
  'Baden-Württemberg': ['Baden Württemberg'],
  'Bavaria': ['Bayern'],
  'Berlin': [],
  'Brandenburg': [],
  'Bremen': [],
  'Hamburg': [],
  'Hesse': ['Hessen'],
  'Lower Saxony': ['Niedersachsen'],
  'Mecklenburg-Western Pomerania': ['Mecklenburg-Vorpommern'],
  'North Rhine-Westphalia': ['Nordrhein-Westfalen', 'NRW'],
  'Rhineland-Palatinate': ['Rhineland Palatinate', 'Rheinland-Pfalz'],
  'Saarland': [],
  'Saxony': ['Sachsen'],
  'Saxony-Anhalt': ['Sachsen-Anhalt'],
  'Schleswig-Holstein': [],
  'Thuringia': ['Thüringen']
};

function addAlternateNames(data, altNamesMap) {
  for (const [key, value] of Object.entries(data)) {
    // Always set alternateNames, preferring the map if available
    if (altNamesMap[key]) {
      value.alternateNames = altNamesMap[key];
    } else if (!value.alternateNames) {
      value.alternateNames = [];
    }
  }
  return data;
}

// Process each data file
const dataDir = path.dirname(__filename);

// Countries
const countriesPath = path.join(dataDir, 'countries.json');
let countries = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
countries = addAlternateNames(countries, countryAltNames);
fs.writeFileSync(countriesPath, JSON.stringify(countries, null, 4));
console.log('✓ Updated countries.json with alternate names');

// US States
const usStatesPath = path.join(dataDir, 'us-states.json');
let usStates = JSON.parse(fs.readFileSync(usStatesPath, 'utf8'));
usStates = addAlternateNames(usStates, usStateAltNames);
fs.writeFileSync(usStatesPath, JSON.stringify(usStates, null, 4));
console.log('✓ Updated us-states.json with alternate names');

// Indian States
const indianStatesPath = path.join(dataDir, 'indian-states.json');
let indianStates = JSON.parse(fs.readFileSync(indianStatesPath, 'utf8'));
indianStates = addAlternateNames(indianStates, indianStateAltNames);
fs.writeFileSync(indianStatesPath, JSON.stringify(indianStates, null, 4));
console.log('✓ Updated indian-states.json with alternate names');

// German States
const germanStatesPath = path.join(dataDir, 'german-states.json');
let germanStates = JSON.parse(fs.readFileSync(germanStatesPath, 'utf8'));
germanStates = addAlternateNames(germanStates, germanStateAltNames);
fs.writeFileSync(germanStatesPath, JSON.stringify(germanStates, null, 4));
console.log('✓ Updated german-states.json with alternate names');

console.log('\nAlternate names added to all data files!');
