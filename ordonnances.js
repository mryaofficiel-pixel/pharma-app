const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const getDb = require('./database');
const { verifierToken, verifierRole } = require('./middleware');

const DB_PATH = './pharmacie.db';

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads');
    },
    filename: function (req, file, cb) {
        const extension = path.extname(file.originalname);
        const nomFichier = 'ordonnance_' + Date.now() + extension;
        cb(null, nomFichier);
    }
});

const fileFilter = (req, file, cb) => {
    const typesAcceptes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (typesAcceptes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Format non accepte. Utilisez JPG, PNG ou PDF.'), false);
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

router.post('/envoyer', verifierToken, verifierRole('pharmacie'), upload.single('ordonnance'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Aucun fichier recu' });
    }
    const db = await getDb();
    db.run('INSERT INTO ordonnances (pharmacie_id, fichier, statut) VALUES (?,?,?)', [req.utilisateur.id, req.file.filename, 'en_attente']);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    res.status(201).json({ message: 'Ordonnance envoyee avec succes', fichier: req.file.filename, statut: 'en_attente' });
});

router.get('/en-attente', verifierToken, verifierRole('pharmacie'), async (req, res) => {
    const db = await getDb();
    const result = db.exec('SELECT * FROM ordonnances WHERE statut = "en_attente"');
    if (result.length > 0) {
        const columns = result[0].columns;
        const rows = result[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => obj[col] = row[i]);
            return obj;
        });
        res.json(rows);
    } else {
        res.json({ message: 'Aucune ordonnance en attente' });
    }
});

router.put('/valider/:id', verifierToken, verifierRole('pharmacie'), async (req, res) => {
    const db = await getDb();
    const { decision } = req.body;
    if (!decision || !['approuve', 'refuse'].includes(decision)) {
        return res.status(400).json({ message: 'Decision doit etre : approuve ou refuse' });
    }
    db.run('UPDATE ordonnances SET statut = ? WHERE id = ?', [decision, parseInt(req.params.id)]);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    res.json({ message: 'Ordonnance ' + decision + ' avec succes' });
});

module.exports = router;