// Data loader with validation

const dataCache = {};

/**
 * Validate a data object structure
 * @param {string} name - Name of the data file
 * @param {Object} data - The data to validate
 * @returns {Object} - Validated and normalized data
 */
function validateData(name, data) {
    if (!data || typeof data !== 'object') {
        throw new Error(`Invalid data: ${name} is not an object`);
    }

    const validated = {};
    const errors = [];

    for (const [key, value] of Object.entries(data)) {
        // Validate structure
        if (!value || typeof value !== 'object') {
            errors.push(`Invalid entry for "${key}": value is not an object`);
            continue;
        }

        // Check required fields
        if (!value.code || typeof value.code !== 'string') {
            errors.push(`Invalid entry for "${key}": missing or invalid "code" field`);
        }

        if (!value.capital || typeof value.capital !== 'string') {
            errors.push(`Invalid entry for "${key}": missing or invalid "capital" field`);
        }

        if (!Array.isArray(value.similar) || value.similar.length === 0) {
            errors.push(`Invalid entry for "${key}": missing or invalid "similar" array`);
        }

        // Check optional fields
        if (value.population !== undefined && typeof value.population !== 'number') {
            errors.push(`Invalid entry for "${key}": "population" must be a number`);
        }

        if (value.capitalCoords !== undefined) {
            if (!Array.isArray(value.capitalCoords) || value.capitalCoords.length !== 2) {
                errors.push(`Invalid entry for "${key}": "capitalCoords" must be [lat, lon]`);
            } else if (!value.capitalCoords.every(n => typeof n === 'number')) {
                errors.push(`Invalid entry for "${key}": "capitalCoords" values must be numbers`);
            }
        }

        validated[key] = value;
    }

    if (errors.length > 0) {
        console.warn(`Validation warnings for ${name}:`, errors);
    }

    return validated;
}

/**
 * Load data from JSON file
 * @param {string} filename - Filename relative to /data folder
 * @returns {Promise<Object>} - Validated data object
 */
async function loadData(filename) {
    const cacheKey = filename;

    // Return cached data if available
    if (dataCache[cacheKey]) {
        return dataCache[cacheKey];
    }

    try {
        const response = await fetch(`./data/${filename}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Failed to load ${filename}`);
        }

        const data = await response.json();
        const validated = validateData(filename, data);

        // Cache the validated data
        dataCache[cacheKey] = validated;

        return validated;
    } catch (error) {
        console.error(`Error loading ${filename}:`, error);
        throw error;
    }
}

/**
 * Load all data files
 * @returns {Promise<Object>} - Object with all data loaded
 */
async function loadAllData() {
    try {
        const [countries, usStates, indianStates, germanStates, ukCountries] = await Promise.all([
            loadData('countries.json'),
            loadData('us-states.json'),
            loadData('indian-states.json'),
            loadData('german-states.json'),
            loadData('uk-countries.json')
        ]);

        return {
            countryData: countries,
            usStateData: usStates,
            indianStateData: indianStates,
            germanStateData: germanStates,
            ukCountryData: ukCountries
        };
    } catch (error) {
        console.error('Error loading data files:', error);
        throw error;
    }
}

// Export for use in the game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { loadData, loadAllData, validateData };
}
