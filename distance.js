// Formule Haversine — calcule la distance entre 2 points GPS
// Résultat en kilomètres
function calculerDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en km

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 10) / 10; // arrondi à 1 décimale
}

module.exports = calculerDistance;
