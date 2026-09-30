import { api } from './api.js'

// Avatars : un modèle 3D fourni avec l'application (client/public/avatars/, repris de FamilyGest)
// ou une photo recadrée en carré dans le navigateur puis envoyée directement chez l'hébergeur S3.
export const MODELES = [
  { groupe: 'Seniors', modeles: [
    ['senior-woman-fair-glasses', 'Femme, lunettes rondes'], ['senior-man-fair-beard', 'Homme, barbe blanche'],
    ['senior-woman-black-curls', 'Femme, boucles argentées'], ['senior-man-black-goatee', 'Homme, bouc argenté'],
    ['senior-woman-asian-glasses', 'Femme, lunettes'], ['senior-man-fair-glasses', 'Homme, lunettes'],
    ['senior-man-asian', 'Homme aux cheveux blancs']
  ] },
  { groupe: 'Adultes', modeles: [
    ['mature-woman-fair-auburn', 'Femme, cheveux auburn'], ['mature-man-fair-grey', 'Homme, poivre et sel'],
    ['mature-woman-black-bun', 'Femme, chignon tressé'], ['mature-man-asian-glasses', 'Homme, lunettes'],
    ['mature-woman-asian-bob', 'Femme, carré'], ['mature-man-black-grey', 'Homme, barbe argentée'],
    ['mature-woman-black-short', 'Femme, cheveux courts argentés'], ['mature-man-fair-silver', 'Homme, cheveux argentés'],
    ['mature-man-asian', 'Homme'],
    ['adult-woman-fair-chestnut', 'Femme, cheveux châtains'], ['adult-man-fair-glasses', 'Homme, lunettes et barbe'],
    ['adult-woman-black-twists', 'Femme, tresses'], ['adult-man-black-beard', 'Homme, barbe'],
    ['adult-woman-asian-ponytail', 'Femme, queue-de-cheval'], ['adult-man-fair-bald', 'Homme chauve, barbe'],
    ['adult-woman-fair-blonde', 'Femme blonde'], ['adult-man-fair-curly', 'Homme, cheveux bouclés'],
    ['adult-man-asian', 'Homme']
  ] },
  { groupe: 'Jeunes', modeles: [
    ['young-woman-fair-ginger', 'Jeune femme rousse'], ['young-man-black-afro', 'Jeune homme, afro'],
    ['young-woman-fair-brunette', 'Jeune femme brune'], ['young-man-fair-brown', 'Jeune homme châtain'],
    ['young-woman-black-puff', 'Jeune femme, chignon'], ['young-man-asian', 'Jeune homme'],
    ['young-woman-fair-blonde', 'Jeune femme blonde'], ['young-man-fair-blond', 'Jeune homme blond'],
    ['young-woman-asian-long', 'Jeune femme, cheveux longs'],
    ['teen-girl-fair-blonde', 'Adolescente blonde'], ['teen-boy-fair-brown', 'Adolescent châtain'],
    ['teen-girl-black-braids', 'Adolescente, tresses'], ['teen-boy-black', 'Adolescent'],
    ['teen-girl-fair-brunette', 'Adolescente, cheveux bouclés'], ['teen-boy-fair-blond', 'Adolescent blond'],
    ['teen-girl-asian-bob', 'Adolescente, carré'], ['teen-boy-asian', 'Adolescent']
  ] },
  { groupe: 'Et aussi', modeles: [['baby', 'Bébé'], ['cat', 'Chat'], ['dog', 'Chien']] }
].map(({ groupe, modeles }) => ({ groupe, modeles: modeles.map(([id, nom]) => ({ id, nom, image: `/avatars/${id}.webp`, choix: `modele:${id}` })) }))

const COTE = 320 // px
const TAILLE_MAX = 200 * 1024

const versBlob = (canvas, qualite) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualite))

// Recadre une image au centre en carré de 320 px et la compresse en JPEG
async function preparer(fichier) {
  let image
  try {
    image = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Ce fichier n\'est pas une image lisible par ce navigateur')
  }
  try {
    const cote = Math.min(image.width, image.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = COTE
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white' // fond des images transparentes (PNG)
    ctx.fillRect(0, 0, COTE, COTE)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, (image.width - cote) / 2, (image.height - cote) / 2, cote, cote, 0, 0, COTE, COTE)
    let blob = await versBlob(canvas, 0.85)
    for (let q = 0.75; blob.size > TAILLE_MAX && q > 0.4; q -= 0.1) blob = await versBlob(canvas, q)
    return blob
  } finally {
    image.close()
  }
}

// `base` : '/profil' pour soi-même, ou '/cercles/<id>/membres/<id>' pour une personne accompagnée.
// Renvoient { avatar (adresse de l'image), avatarChoix }.
export const choisirAvatar = (base, choix) => api('PUT', `${base}/avatar`, { avatar: choix })

export async function envoyerPhotoAvatar(base, fichier) {
  const blob = await preparer(fichier)
  const { photo, envoi } = await api('POST', `${base}/avatar/envoi`, { taille: blob.size })
  let reponse
  try {
    reponse = await fetch(envoi, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } })
  } catch {
    throw new Error('L\'hébergeur des photos ne répond pas (connexion, ou autorisation CORS à refaire dans l\'administration)')
  }
  if (!reponse.ok) throw new Error(`L'hébergeur des photos a refusé l'envoi (erreur ${reponse.status})`)
  return choisirAvatar(base, photo)
}
