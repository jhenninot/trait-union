// Adresse publique de l'application : APP_URL si défini, sinon déduite de la requête
// (derrière Nginx Proxy Manager, protocole et hôte viennent des en-têtes X-Forwarded-*).
export const urlApplication = (req) => process.env.APP_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`
