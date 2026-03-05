const express = require('express');
const app = express();
const calculerDistance = require('./distance');
const getDb = require('./database');

app.use(express.json());

app.get('/', (req, res) => {
    res.send('PharmaLink API active');
});

app.get('/recherche/:nom', async (req, res) => {
    const db = await getDb();
    const nomProduit = req.params.nom.toLowerCase();
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const result = db.exec("SELECT * FROM produits WHERE LOWER(nom) LIKE '%" + nomProduit + "%'");
    if (result.length > 0) {
        const columns = result[0].columns;
        const rows = result[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => obj[col] = row[i]);
            if (lat && lon && obj.latitude && obj.longitude) {
                obj.distance_km = calculerDistance(lat, lon, obj.latitude, obj.longitude);
            } else {
                obj.distance_km = null;
            }
            return obj;
        });
        rows.sort((a, b) => {
            if (a.distance_km === null) return 1;
            if (b.distance_km === null) return -1;
            return a.distance_km - b.distance_km;
        });
        res.json(rows);
    } else {
        res.status(404).json({ message: 'Produit non disponible' });
    }
});

app.post('/produits', async (req, res) => {
    const db = await getDb();
    const { nom, pharmacie, ville, telephone, latitude, longitude } = req.body;
    if (!nom || !pharmacie || !ville) {
        return res.status(400).json({ message: 'Champs manquants' });
    }
    db.run('INSERT INTO produits (nom, pharmacie, ville, telephone, latitude, longitude) VALUES (?,?,?,?,?,?)', [nom, pharmacie, ville, telephone || null, latitude || null, longitude || null]);
    const fs = require('fs');
    fs.writeFileSync('./pharmacie.db', Buffer.from(db.export()));
    res.status(201).json({ message: 'Medicament ajoute avec succes' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Serveur PharmaLink lance sur port ' + PORT);
});
