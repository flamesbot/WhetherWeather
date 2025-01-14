// server.js
require('dotenv').config();
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware for logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Database setup
const db = new sqlite3.Database(process.env.DB_NAME || 'weather.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS weather_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location TEXT,
    temperature REAL,
    conditions TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Coordinate-based weather endpoint
app.get('/api/weather/coords/:lat/:lon', async (req, res) => {
  try {
    const { lat, lon } = req.params;
    const API_KEY = process.env.OPENWEATHER_API_KEY;
    
    console.log(`Weather request for coordinates: ${lat}, ${lon}`);
    
    if (!API_KEY) {
      throw new Error('API key not configured');
    }
    
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`;
    console.log('Fetching weather from:', weatherUrl.replace(API_KEY, 'API_KEY'));
    
    const weatherResponse = await fetch(weatherUrl);
    const weatherData = await weatherResponse.json();
    
    if (weatherData.cod && weatherData.cod !== 200) {
      throw new Error(weatherData.message || 'Error fetching weather data');
    }
    
    // Store in database
    db.run(
      'INSERT INTO weather_data (location, temperature, conditions) VALUES (?, ?, ?)',
      [weatherData.name, weatherData.main.temp, weatherData.weather[0].description],
      (err) => {
        if (err) {
          console.error('Database error:', err);
        }
      }
    );
    
    res.json(weatherData);
  } catch (error) {
    console.error('Error in /api/weather/coords:', error);
    res.status(500).json({ error: error.message });
  }
});

// City name-based weather endpoint
app.get('/api/weather/:location', async (req, res) => {
  try {
    const location = req.params.location;
    const API_KEY = process.env.OPENWEATHER_API_KEY;
    
    console.log(`Weather request for location: ${location}`);
    
    if (!API_KEY) {
      throw new Error('API key not configured');
    }
    
    // First, get coordinates from location API
    const geocodeUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${API_KEY}`;
    console.log('Geocoding URL:', geocodeUrl.replace(API_KEY, 'API_KEY'));
    
    const geocodeResponse = await fetch(geocodeUrl);
    const locationData = await geocodeResponse.json();
    
    if (!locationData || locationData.length === 0) {
      throw new Error('Location not found');
    }
    
    // Then get weather data using coordinates
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${locationData[0].lat}&lon=${locationData[0].lon}&units=metric&appid=${API_KEY}`;
    console.log('Weather URL:', weatherUrl.replace(API_KEY, 'API_KEY'));
    
    const weatherResponse = await fetch(weatherUrl);
    const weatherData = await weatherResponse.json();
    
    if (weatherData.cod && weatherData.cod !== 200) {
      throw new Error(weatherData.message || 'Error fetching weather data');
    }
    
    // Store in database
    db.run(
      'INSERT INTO weather_data (location, temperature, conditions) VALUES (?, ?, ?)',
      [location, weatherData.main.temp, weatherData.weather[0].description],
      (err) => {
        if (err) {
          console.error('Database error:', err);
        }
      }
    );
    
    res.json(weatherData);
  } catch (error) {
    console.error('Error in /api/weather:', error);
    res.status(500).json({ error: error.message });
  }
});

// History endpoint
app.get('/api/history/:location', (req, res) => {
  const location = req.params.location;
  db.all(
    'SELECT * FROM weather_data WHERE location = ? ORDER BY timestamp DESC LIMIT 10',
    [location],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
});