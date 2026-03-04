const jwt = require('jsonwebtoken');

const SECRET = 'pharmalink_secret_2024';

function verifierToken(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({ message: 'Acces refuse : token manquant' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Acces refuse : format invalide. Utilisez : Bearer VOTRE_TOKEN' });
    }

    try {
        const utilisateur = jwt.verify(token, SECRET);
        req.utilisateur = utilisateur;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Token invalide ou expire' });
    }
}

function verifierRole(...rolesAutorises) {
    return (req, res, next) => {
        if (!rolesAutorises.includes(req.utilisateur.role)) {
            return res.status(403).json({ message: 'Acces refuse : vous n avez pas les droits necessaires' });
        }
        next();
    };
}

module.exports = { verifierToken, verifierRole };