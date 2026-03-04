const express = require('express');
const router = express.Router();
const fs = require('fs');
const getDb = require('./database');
const calculerDistance = require('./distance');
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

// DEMARRER UNE LIVRAISON — appelé quand pharmacie B confirme la commande
router.post('/demarrer', verifierToken, verifierRole('pharmacie'), async (req, res) => {
    const db = await getDb();
    const { commande_id } = req.body;

    if (!commande_id) {
        return res.status(400).json({ message: 'commande_id obligatoire' });
    }

    // Creer la livraison
    db.run('INSERT INTO livraisons (commande_id, statut) VALUES (?,?)', [commande_id, 'cherche_livreur']);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

    // Recuperer les coordonnees de la pharmacie fournisseur
    const commande = db.exec('SELECT * FROM commandes WHERE id = ' + commande_id);
    if (commande.length === 0) {
        return res.status(404).json({ message: 'Commande introuvable' });
    }
    const commandeObj = rowsToObjects(commande)[0];
    const fournisseurId = commandeObj.pharmacie_fournisseur_id;

    const fournisseur = db.exec('SELECT * FROM utilisateurs WHERE id = ' + fournisseurId);
    const fournisseurObj = rowsToObjects(fournisseur)[0];

    // Chercher les livreurs certifies avec leurs coordonnees GPS
    const livreurs = db.exec('SELECT * FROM utilisateurs WHERE role = "livreur" AND statut = "approuve" AND latitude IS NOT NULL AND longitude IS NOT NULL');
    const livreursListe = rowsToObjects(livreurs);

    if (livreursListe.length === 0) {
        return res.status(404).json({ message: 'Aucun livreur disponible pour le moment' });
    }

    // Calculer la distance de chaque livreur par rapport a la pharmacie fournisseur
    const livreursAvecDistance = livreursListe.map(livreur => ({
        ...livreur,
        distance_km: calculerDistance(
            fournisseurObj.latitude, fournisseurObj.longitude,
            livreur.latitude, livreur.longitude
        )
    }));

    // Trier par distance — les plus proches en premier
    livreursAvecDistance.sort((a, b) => a.distance_km - b.distance_km);

    // Envoyer notification avec compte a rebours aux 3 livreurs les plus proches
    const io = req.app.get('io');
    const livreursNotifies = livreursAvecDistance.slice(0, 3);

    livreursNotifies.forEach(livreur => {
        if (io) {
            io.to('livreur_' + livreur.id).emit('nouvelle_livraison', {
                message: 'Nouvelle livraison disponible ! Vous avez 30 secondes pour accepter.',
                commande_id: commande_id,
                pharmacie_depart: fournisseurObj.nom,
                distance_km: livreur.distance_km,
                compte_a_rebours: 30
            });
        }
    });

    res.status(201).json({
        message: 'Recherche de livreur lancee',
        livreurs_notifies: livreursNotifies.length,
        livraison_statut: 'cherche_livreur'
    });
});

// ACCEPTER UNE LIVRAISON — livreur accepte la mission
router.put('/accepter/:commande_id', verifierToken, verifierRole('livreur'), async (req, res) => {
    const db = await getDb();
    const commande_id = parseInt(req.params.commande_id);

    // Verifier que la livraison est encore disponible
    const livraison = db.exec('SELECT * FROM livraisons WHERE commande_id = ' + commande_id + ' AND statut = "cherche_livreur"');
    if (livraison.length === 0 || livraison[0].values.length === 0) {
        return res.status(400).json({ message: 'Cette livraison n est plus disponible' });
    }

    // Attribuer la livraison au livreur
    db.run('UPDATE livraisons SET livreur_id = ?, statut = ? WHERE commande_id = ?', [req.utilisateur.id, 'livreur_assigne', commande_id]);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

    // Notifier la pharmacie commandeur et fournisseur
    const commande = db.exec('SELECT * FROM commandes WHERE id = ' + commande_id);
    const commandeObj = rowsToObjects(commande)[0];
    const io = req.app.get('io');

    if (io) {
        io.to('pharmacie_' + commandeObj.pharmacie_commandeur_id).emit('livreur_assigne', {
            message: 'Un livreur a accepte votre commande !',
            livreur: req.utilisateur.nom,
            commande_id: commande_id
        });
        io.to('pharmacie_' + commandeObj.pharmacie_fournisseur_id).emit('livreur_assigne', {
            message: 'Le livreur arrive pour recuperer le colis',
            livreur: req.utilisateur.nom,
            commande_id: commande_id
        });
    }

    res.json({ message: 'Livraison acceptee avec succes', statut: 'livreur_assigne' });
});

// DEPART — livreur confirme qu'il a recupere le colis
router.put('/depart/:commande_id', verifierToken, verifierRole('livreur'), async (req, res) => {
    const db = await getDb();
    const commande_id = parseInt(req.params.commande_id);

    db.run('UPDATE livraisons SET statut = ? WHERE commande_id = ? AND livreur_id = ?', ['en_route', commande_id, req.utilisateur.id]);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

    const commande = db.exec('SELECT * FROM commandes WHERE id = ' + commande_id);
    const commandeObj = rowsToObjects(commande)[0];
    const io = req.app.get('io');

    if (io) {
        io.to('pharmacie_' + commandeObj.pharmacie_commandeur_id).emit('livraison_en_route', {
            message: 'Votre colis est en route !',
            livreur: req.utilisateur.nom,
            commande_id: commande_id
        });
    }

    res.json({ message: 'Depart confirme — livraison en route', statut: 'en_route' });
});

// MISE A JOUR GPS — livreur envoie sa position toutes les X secondes
router.put('/position/:commande_id', verifierToken, verifierRole('livreur'), async (req, res) => {
    const db = await getDb();
    const commande_id = parseInt(req.params.commande_id);
    const { latitude, longitude, distance_parcourue } = req.body;

    if (!latitude || !longitude) {
        return res.status(400).json({ message: 'latitude et longitude obligatoires' });
    }

    // Recuperer la distance precedente
    const livraison = db.exec('SELECT * FROM livraisons WHERE commande_id = ' + commande_id);
    const livraisonObj = rowsToObjects(livraison)[0];
    const ancienneDistance = livraisonObj ? livraisonObj.distance_parcourue : 0;
    const nouvelleDistance = distance_parcourue || ancienneDistance;

    db.run('UPDATE livraisons SET distance_parcourue = ? WHERE commande_id = ?', [nouvelleDistance, commande_id]);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

    // Alerte tous les 1 km
    const kmAncien = Math.floor(ancienneDistance);
    const kmNouveau = Math.floor(nouvelleDistance);

    if (kmNouveau > kmAncien) {
        const commande = db.exec('SELECT * FROM commandes WHERE id = ' + commande_id);
        const commandeObj = rowsToObjects(commande)[0];
        const io = req.app.get('io');

        if (io) {
            io.to('pharmacie_' + commandeObj.pharmacie_commandeur_id).emit('alerte_km', {
                message: 'Le livreur est a ' + kmNouveau + ' km de son depart',
                km_parcourus: kmNouveau,
                commande_id: commande_id
            });
        }
    }

    res.json({ message: 'Position mise a jour', distance_parcourue: nouvelleDistance });
});

// CONFIRMATION LIVRAISON — pharmacie A confirme la reception
router.put('/confirmer-reception/:commande_id', verifierToken, verifierRole('pharmacie'), async (req, res) => {
    const db = await getDb();
    const commande_id = parseInt(req.params.commande_id);

    db.run('UPDATE livraisons SET statut = ? WHERE commande_id = ?', ['pharmacie_confirme', commande_id]);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

    // Verifier si le livreur a aussi confirme
    const livraison = db.exec('SELECT * FROM livraisons WHERE commande_id = ' + commande_id);
    const livraisonObj = rowsToObjects(livraison)[0];

    res.json({ message: 'Reception confirmee par la pharmacie', statut: 'pharmacie_confirme' });
});

// CONFIRMATION LIVREUR — livreur confirme la remise du colis
router.put('/confirmer-remise/:commande_id', verifierToken, verifierRole('livreur'), async (req, res) => {
    const db = await getDb();
    const commande_id = parseInt(req.params.commande_id);

    db.run('UPDATE livraisons SET statut = ? WHERE commande_id = ?', ['livree', commande_id]);
    db.run('UPDATE commandes SET statut = ? WHERE id = ?', ['livree', commande_id]);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

    const commande = db.exec('SELECT * FROM commandes WHERE id = ' + commande_id);
    const commandeObj = rowsToObjects(commande)[0];
    const io = req.app.get('io');

    if (io) {
        io.to('pharmacie_' + commandeObj.pharmacie_commandeur_id).emit('livraison_terminee', {
            message: 'Livraison terminee et confirmee !',
            commande_id: commande_id
        });
    }

    res.json({ message: 'Livraison terminee avec succes !', statut: 'livree' });
});

module.exports = router;