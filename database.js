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
    db.run('CREATE TABLE IF NOT EXISTS produits (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, pharmacie TEXT NOT NULL, ville TEXT NOT NULL, telephone TEXT, latitude REAL, longitude REAL)');
    const result = db.exec('SELECT COUNT(*) as total FROM produits');
    const total = result[0] ? result[0].values[0][0] : 0;
    if (total === 0) {
        db.run('INSERT INTO produits (nom, pharmacie, ville, telephone, latitude, longitude) VALUES (?,?,?,?,?,?)', ['Paracetamol', 'Pharmacie Centrale', 'Lome', '+228 90000001', 6.1375, 1.2123]);
        db.run('INSERT INTO produits (nom, pharmacie, ville, telephone, latitude, longitude) VALUES (?,?,?,?,?,?)', ['Amoxicilline', 'Pharmacie Sante Plus', 'Kpalime', '+228 90000002', 6.9000, 0.6333]);
        db.run('INSERT INTO produits (nom, pharmacie, ville, telephone, latitude, longitude) VALUES (?,?,?,?,?,?)', ['Ibuprofene', 'Pharmacie du Peuple', 'Sokode', '+228 90000003', 8.9833, 1.1333]);
        console.log('Donnees de test inserees');
    }
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    return db;
}

module.exports = getDb;
