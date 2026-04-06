/**
 * Data Validation Script
 * Validates all game data files when they are loaded
 */

async function loadAndValidateData() {
  const dataFiles = [
    { name: 'countries', path: 'data/countries.json' },
    { name: 'us-states', path: 'data/us-states.json' },
    { name: 'indian-states', path: 'data/indian-states.json' },
    { name: 'german-states', path: 'data/german-states.json' }
  ];

  const loadedData = {};
  const errors = [];

  for (const file of dataFiles) {
    try {
      const response = await fetch(file.path);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const validation = validateDataFile(file.name, data);

      if (validation.valid) {
        loadedData[file.name] = data;
        console.log(`✓ ${file.name} loaded and validated`);
      } else {
        errors.push({
          file: file.name,
          issues: validation.issues
        });
      }
    } catch (err) {
      errors.push({
        file: file.name,
        error: err.message
      });
    }
  }

  if (errors.length > 0) {
    console.error('Data validation errors:', errors);
    throw new Error('Failed to load all required data files');
  }

  return loadedData;
}

function validateDataFile(fileName, data) {
  const issues = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, issues: ['Data is not an object'] };
  }

  const entries = Object.entries(data);
  if (entries.length === 0) {
    issues.push('Data object is empty');
  }

  // Check required fields for each entry
  for (const [key, value] of entries) {
    if (!value || typeof value !== 'object') {
      issues.push(`Entry "${key}" is not an object`);
      continue;
    }

    const requiredFields = ['code', 'capital'];

    for (const field of requiredFields) {
      if (!value[field]) {
        issues.push(`Entry "${key}" missing required field: ${field}`);
      }
    }

    // Validate specific fields
    if (value.code && typeof value.code !== 'string') {
      issues.push(`Entry "${key}": code should be a string`);
    }
    if (value.capital && typeof value.capital !== 'string') {
      issues.push(`Entry "${key}": capital should be a string`);
    }
    if (value.capitalCoords && !Array.isArray(value.capitalCoords)) {
      issues.push(`Entry "${key}": capitalCoords should be an array`);
    }
    if (value.population && typeof value.population !== 'number') {
      issues.push(`Entry "${key}": population should be a number`);
    }
    if (value.similar && !Array.isArray(value.similar)) {
      issues.push(`Entry "${key}": similar should be an array`);
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
