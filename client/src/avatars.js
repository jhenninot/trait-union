import { api } from './api.js'
import { deposerFichier } from './reessais.js'

// Avatars : un modèle 3D fourni avec l'application (client/public/avatars/, repris de FamilyGest)
// ou une photo recadrée en carré dans le navigateur (RecadrageAvatar.vue) puis envoyée directement chez l'hébergeur S3.
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

// Ouvre une image choisie par la personne, déjà tournée selon ses données EXIF
export async function ouvrirImage(fichier) {
  try {
    return await createImageBitmap(fichier, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Ce fichier n\'est pas une image lisible par ce navigateur')
  }
}

// Découpe le carré choisi dans l'écran de recadrage (sx, sy, cote en pixels de l'image source)
// et le réduit en carré de 320 px JPEG, compressé sous 200 Ko
export async function recadrer(source, { sx, sy, cote }) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = COTE
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white' // fond des images transparentes (PNG)
  ctx.fillRect(0, 0, COTE, COTE)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, cote, cote, 0, 0, COTE, COTE)
  let blob = await versBlob(canvas, 0.85)
  for (let q = 0.75; blob.size > TAILLE_MAX && q > 0.4; q -= 0.1) blob = await versBlob(canvas, q)
  return blob
}

// `base` : '/profil' pour soi-même, ou '/cercles/<id>/membres/<id>' pour une personne accompagnée.
// Renvoient { avatar (adresse de l'image), avatarChoix }.
export const choisirAvatar = (base, choix) => api('PUT', `${base}/avatar`, { avatar: choix })

// `blob` : la photo déjà recadrée (voir recadrer)
export async function envoyerPhotoAvatar(base, blob) {
  const { photo, envoi } = await api('POST', `${base}/avatar/envoi`, { taille: blob.size })
  await deposerFichier(envoi, blob, 'image/jpeg')
  return choisirAvatar(base, photo)
}
