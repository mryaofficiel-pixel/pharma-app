const express = require('express');
const app = express();
const getDb = require('./database');
const authRoutes = require('./auth');
const { verifierToken, verifierRole } = require('./middleware');

app.use(express.json());

app.use('/auth', authRoutes);
const ordonnancesRoutes = require('./ordonnances');
app.use('/ordonnances', ordonnancesRoutes);
app.use('/uploads', express.static('uploads'));

app.get('/', (req, res) => {
    res.send('Serveur Pharmacie actif');
});

// Route publique — tout le monde peut chercher un medicament
app.get('/recherche/:nom', async (req, res) => {
    const db = await getDb();
    const nomProduit = req.params.nom.toLowerCase();

    const result = db.exec(
        "SELECT * FROM produits WHERE LOWER(nom) LIKE '%" + nomProduit + "%'"
    );

    if (result.length > 0) {
        const columns = result[0].columns;
        const rows = result[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => obj[col] = row[i]);
            return obj;
        });
        res.json(rows);
    } else {
        res.status(404).json({ message: 'Produit non disponible' });
    }
});

// Route protegee — seulement les pharmacies connectees peuvent ajouter
app.post('/produits', verifierToken, verifierRole('pharmacie'), async (req, res) => {
    const db = await getDb();
    const { nom, pharmacie, ville } = req.body;

    if (!nom || !pharmacie || !ville) {
        return res.status(400).json({ message: 'Champs manquants' });
    }

    db.run('INSERT INTO produits (nom, pharmacie, ville) VALUES (?,?,?)', [nom, pharmacie, ville]);

    const fs = require('fs');
    fs.writeFileSync('./pharmacie.db', Buffer.from(db.export()));

    res.status(201).json({
        message: 'Medicament ajoute avec succes',
        ajoute_par: req.utilisateur.nom
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log('Serveur lance sur http://localhost:' + PORT);
});