const initSqlJs = require('sql.js');
const fs = require('fs');

const DB_PATH = './pharmacie.db';
let db;

async function getDb() {
    if (db) return db;

    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    db.run('CREATE TABLE IF NOT EXISTS produits (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, pharmacie TEXT NOT NULL, ville TEXT NOT NULL, latitude REAL, longitude REAL)');

    db.run('CREATE TABLE IF NOT EXISTS utilisateurs (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, email TEXT NOT NULL UNIQUE, mot_de_passe TEXT NOT NULL, role TEXT NOT NULL, statut TEXT NOT NULL DEFAULT "en_attente", latitude REAL, longitude REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');

    db.run('CREATE TABLE IF NOT EXISTS ordonnances (id INTEGER PRIMARY KEY AUTOINCREMENT, pharmacie_id INTEGER NOT NULL, fichier TEXT NOT NULL, statut TEXT NOT NULL DEFAULT "en_attente", created_at TEXT DEFAULT CURRENT_TIMESTAMP)');

    db.run('CREATE TABLE IF NOT EXISTS commandes (id INTEGER PRIMARY KEY AUTOINCREMENT, pharmacie_commandeur_id INTEGER NOT NULL, pharmacie_fournisseur_id INTEGER NOT NULL, produit_id INTEGER NOT NULL, ordonnance_id INTEGER NOT NULL, statut TEXT NOT NULL DEFAULT "en_attente", created_at TEXT DEFAULT CURRENT_TIMESTAMP)');

    db.run('CREATE TABLE IF NOT EXISTS livraisons (id INTEGER PRIMARY KEY AUTOINCREMENT, commande_id INTEGER NOT NULL, livreur_id INTEGER, statut TEXT NOT NULL DEFAULT "cherche_livreur", distance_parcourue REAL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');

    const result = db.exec('SELECT COUNT(*) as total FROM produits');
    const total = result[0] ? result[0].values[0][0] : 0;

    if (total === 0) {
        db.run('INSERT INTO produits (nom, pharmacie, ville, latitude, longitude) VALUES (?,?,?,?,?)', ['Paracetamol', 'Pharmacie Centrale', 'Lome', 6.1375, 1.2123]);
        db.run('INSERT INTO produits (nom, pharmacie, ville, latitude, longitude) VALUES (?,?,?,?,?)', ['Amoxicilline', 'Pharmacie Sante Plus', 'Kpalime', 6.9000, 0.6333]);
        db.run('INSERT INTO produits (nom, pharmacie, ville, latitude, longitude) VALUES (?,?,?,?,?)', ['Ibuprofene', 'Pharmacie du Peuple', 'Sokode', 8.9833, 1.1333]);
        console.log('Donnees de test inserees');
    }

    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    return db;
}

module.exports = getDb;