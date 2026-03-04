const express = require('express');
const router = express.Router();
const fs = require('fs');
const getDb = require('./database');
const { verifierToken, verifierRole } = require('./middleware');

const DB_PATH = './pharmacie.db';

function rowsToObjects(result) {
    if (!result || result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

// PASSER UNE COMMANDE
router.post('/passer', verifierToken, verifierRole('pharmacie'), async (req, res) => {
    const db = await getDb();
    const { produit_id, pharmacie_fournisseur_id, ordonnance_id } = req.body;

    if (!produit_id || !pharmacie_fournisseur_id || !ordonnance_id) {
        return res.status(400).json({ message: 'Champs manquants : produit_id, pharmacie_fournisseur_id, ordonnance_id' });
    }

    // Verifier que l'ordonnance est approuvee
    const ordonnance = db.exec('SELECT * FROM ordonnances WHERE id = ' + ordonnance_id + ' AND statut = "approuve"');
    if (ordonnance.length === 0 || ordonnance[0].values.length === 0) {
        return res.status(400).json({ message: 'Ordonnance non valide ou non approuvee' });
    }

    // Verifier que le produit existe
    const produit = db.exec('SELECT * FROM produits WHERE id = ' + produit_id);
    if (produit.length === 0 || produit[0].values.length === 0) {
        return res.status(400).json({ message: 'Produit introuvable' });
    }

    db.run(
        'INSERT INTO commandes (pharmacie_commandeur_id, pharmacie_fournisseur_id, produit_id, ordonnance_id, statut) VALUES (?,?,?,?,?)',
        [req.utilisateur.id, pharmacie_fournisseur_id, produit_id, ordonnance_id, 'en_attente']
    );

    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

    // Notifier la pharmacie fournisseur via Socket.io
    const io = req.app.get('io');
    if (io) {
        io.to('pharmacie_' + pharmacie_fournisseur_id).emit('nouvelle_commande', {
            message: 'Vous avez une nouvelle commande !',
            produit_id: produit_id,
            commandeur_id: req.utilisateur.id
        });
    }

    res.status(201).json({ message: 'Commande passee avec succes', statut: 'en_attente' });
});

// VOIR MES COMMANDES RECUES (pharmacie fournisseur)
router.get('/recues', verifierToken, verifierRole('pharmacie'), async (req, res) => {
    const db = await getDb();

    const result = db.exec('SELECT * FROM commandes WHERE pharmacie_fournisseur_id = ' + req.utilisateur.id);
    const commandes = rowsToObjects(result);

    if (commandes.length > 0) {
        res.json(commandes);
    } else {
        res.json({ message: 'Aucune commande recue' });
    }
});

// VOIR MES COMMANDES PASSEES (pharmacie commandeur)
router.get('/passees', verifierToken, verifierRole('pharmacie'), async (req, res) => {
    const db = await getDb();

    const result = db.exec('SELECT * FROM commandes WHERE pharmacie_commandeur_id = ' + req.utilisateur.id);
    const commandes = rowsToObjects(result);

    if (commandes.length > 0) {
        res.json(commandes);
    } else {
        res.json({ message: 'Aucune commande passee' });
    }
});

// CONFIRMER UNE COMMANDE (pharmacie fournisseur confirme qu'elle a le produit)
router.put('/confirmer/:id', verifierToken, verifierRole('pharmacie'), async (req, res) => {
    const db = await getDb();
    const { decision } = req.body;

    if (!decision || !['confirmee', 'refusee'].includes(decision)) {
        return res.status(400).json({ message: 'Decision doit etre : confirmee ou refusee' });
    }

    db.run('UPDATE commandes SET statut = ? WHERE id = ?', [decision, parseInt(req.params.id)]);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

    // Notifier la pharmacie commandeur
    const commande = db.exec('SELECT * FROM commandes WHERE id = ' + req.params.id);
    if (commande.length > 0) {
        const io = req.app.get('io');
        const commandeurId = commande[0].values[0][1];
        if (io) {
            io.to('pharmacie_' + commandeurId).emit('commande_mise_a_jour', {
                message: 'Votre commande a ete ' + decision,
                commande_id: req.params.id,
                statut: decision
            });
        }
    }

    res.json({ message: 'Commande ' + decision + ' avec succes' });
});

module.exports = router;