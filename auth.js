const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const getDb = require('./database');

const SECRET = 'pharmalink_secret_2024';
const DB_PATH = './pharmacie.db';

// INSCRIPTION
router.post('/inscription', async (req, res) => {
    const db = await getDb();
    const { nom, email, mot_de_passe, role } = req.body;

    if (!nom || !email || !mot_de_passe || !role) {
        return res.status(400).json({ message: 'Tous les champs sont obligatoires : nom, email, mot_de_passe, role' });
    }

    const rolesAcceptes = ['pharmacie', 'livreur'];
    if (!rolesAcceptes.includes(role)) {
        return res.status(400).json({ message: 'Le role doit etre : pharmacie ou livreur' });
    }

    const existant = db.exec('SELECT id FROM utilisateurs WHERE email = "' + email + '"');
    if (existant.length > 0 && existant[0].values.length > 0) {
        return res.status(400).json({ message: 'Cet email est deja utilise' });
    }

    const motDePasseChiffre = await bcrypt.hash(mot_de_passe, 10);

    db.run(
        'INSERT INTO utilisateurs (nom, email, mot_de_passe, role, statut) VALUES (?,?,?,?,?)',
        [nom, email, motDePasseChiffre, role, 'en_attente']
    );

    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

    res.status(201).json({
        message: 'Compte cree avec succes. En attente de validation par l admin.',
        statut: 'en_attente'
    });
});

// CONNEXION
router.post('/connexion', async (req, res) => {
    const db = await getDb();
    const { email, mot_de_passe } = req.body;

    if (!email || !mot_de_passe) {
        return res.status(400).json({ message: 'Email et mot de passe obligatoires' });
    }

    const result = db.exec('SELECT * FROM utilisateurs WHERE email = "' + email + '"');

    if (result.length === 0 || result[0].values.length === 0) {
        return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const columns = result[0].columns;
    const row = result[0].values[0];
    const utilisateur = {};
    columns.forEach((col, i) => utilisateur[col] = row[i]);

    const motDePasseCorrect = await bcrypt.compare(mot_de_passe, utilisateur.mot_de_passe);
    if (!motDePasseCorrect) {
        return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    if (utilisateur.statut === 'en_attente') {
        return res.status(403).json({ message: 'Votre compte est en attente de validation par l admin' });
    }

    if (utilisateur.statut === 'refuse') {
        return res.status(403).json({ message: 'Votre compte a ete refuse. Contactez l admin.' });
    }

    const token = jwt.sign(
        { id: utilisateur.id, role: utilisateur.role, nom: utilisateur.nom },
        SECRET,
        { expiresIn: '24h' }
    );

    res.json({
        message: 'Connexion reussie',
        token: token,
        utilisateur: {
            id: utilisateur.id,
            nom: utilisateur.nom,
            email: utilisateur.email,
            role: utilisateur.role
        }
    });
});

// VALIDATION PAR L'ADMIN
router.put('/valider/:id', async (req, res) => {
    const db = await getDb();
    const { decision } = req.body;

    if (!decision || !['approuve', 'refuse'].includes(decision)) {
        return res.status(400).json({ message: 'Decision doit etre : approuve ou refuse' });
    }

   db.run('UPDATE utilisateurs SET statut = ? WHERE id = ?', [decision, parseInt(req.params.id)]);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

    res.json({ message: 'Compte ' + decision + ' avec succes' });
});

module.exports = router;