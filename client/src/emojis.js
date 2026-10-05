// Émojis proposés dans la messagerie, rangés comme sur WhatsApp. Ce sont des caractères Unicode :
// chaque appareil les dessine avec sa propre police (Android, iPhone, Windows), rien à télécharger.
const CATEGORIES = [
  ['visages', 'Visages', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 🤡 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾'],
  ['coeurs', 'Cœurs et gestes', '❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💐 💋 👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🫶 🫂'],
  ['personnes', 'Personnes et fêtes', '👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 👨‍👩‍👧 👨‍👩‍👧‍👦 👪 👫 💑 💏 🤰 🤱 👼 🎅 🤶 🧑‍🎄 👰 🤵 🧑‍⚕️ 🧑‍🍳 🧑‍🌾 🧑‍🔧 💃 🕺 🚶 🧑‍🦯 🧑‍🦽 🎂 🎉 🎊 🎈 🎁 🥂 🍾 🎄 🎃 🕯️ 🎶 🎵'],
  ['nature', 'Animaux et nature', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦉 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐟 🐬 🐳 🌸 🌼 🌻 🌺 🌹 🌷 🌱 🌿 🍀 🍁 🍂 🌳 🌲 🌵 🌾 ☀️ 🌤️ ⛅ 🌧️ ⛈️ ❄️ ☃️ 🌈 🌙 ⭐ 🌟 ✨ 🔥 💧 🌊'],
  ['nourriture', 'Nourriture', '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥕 🌽 🥔 🧅 🧄 🍄 🥖 🥐 🍞 🧀 🥚 🍳 🥞 🥓 🍗 🍖 🍔 🍟 🍕 🥪 🌮 🥗 🍝 🍲 🍜 🍣 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 🍪 🍩 🍦 ☕ 🍵 🥛 🍷 🍺 🥤 🧃'],
  ['activites', 'Activités et voyages', '⚽ 🏀 🏉 🎾 🏐 🏓 🎳 ⛳ 🎣 🚴 🚵 🏊 🧘 🥾 🏕️ 🎨 🧶 🧵 🎹 🎸 🎻 🃏 🧩 ♟️ 🎲 📚 📖 🚗 🚕 🚌 🚑 🚒 🚲 🛵 🚂 ✈️ 🚢 ⛵ 🏠 🏡 🏥 ⛪ 🏖️ 🏔️ 🗼 🌍 🗺️'],
  ['objets', 'Objets et symboles', '📱 ☎️ 💻 📷 📺 📻 ⏰ ⌛ 💡 🕯️ 💊 🩺 🩹 🛏️ 🛋️ 🪑 🚪 🧸 👓 🧣 🧤 🧥 👗 👒 🌂 ☂️ 💌 ✉️ 📦 📅 📌 ✂️ 🔑 🏆 🥇 🎖️ ✅ ❌ ❓ ❗ 💯 🆗 🆒 ➡️ ⬅️ 🔔 💤 ⚠️']
]

export const CATEGORIES_EMOJI = CATEGORIES.map(([cle, nom, liste]) => ({ cle, nom, emojis: liste.split(' ') }))

// Les plus courants dans une famille : pour la barre de l'aidé et le premier onglet sans historique
export const EMOJIS_FREQUENTS = ['❤️', '😘', '😊', '😂', '👍', '🙏', '🥰', '😢', '🎂', '🌸', '☀️', '👋']

// Récents : mémorisés sur l'appareil (24 au plus)
const CLE = 'emojis-recents'
export function emojisRecents() {
  try {
    const liste = JSON.parse(localStorage.getItem(CLE) ?? '[]')
    return Array.isArray(liste) && liste.length ? liste : EMOJIS_FREQUENTS
  } catch {
    return EMOJIS_FREQUENTS
  }
}
export function retenirEmoji(e) {
  try {
    const liste = [e, ...emojisRecents().filter((x) => x !== e)].slice(0, 24)
    localStorage.setItem(CLE, JSON.stringify(liste))
  } catch { /* stockage indisponible */ }
}

// Un message fait seulement d'émojis (3 au plus) s'affiche en grand, comme sur WhatsApp
const SEUL_EMOJI = /^(?:\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}️?)*|\p{Regional_Indicator}{2}|\s)+$/u
export function seulementEmojis(texte) {
  const t = String(texte ?? '').trim()
  if (!t || !SEUL_EMOJI.test(t)) return false
  const sans = t.replace(/\s/g, '')
  const n = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(sans)].length
    : sans.match(/\p{Extended_Pictographic}|\p{Regional_Indicator}{2}/gu).length
  return n <= 3
}

// Insère `e` à la place du curseur d'un champ de texte (v-model `valeur`), et y remet le curseur
export function insererDans(champ, valeur, e) {
  if (!champ) return valeur + e
  const debut = champ.selectionStart ?? valeur.length
  const fin = champ.selectionEnd ?? valeur.length
  const nouveau = valeur.slice(0, debut) + e + valeur.slice(fin)
  requestAnimationFrame(() => {
    champ.setSelectionRange(debut + e.length, debut + e.length)
  })
  return nouveau
}
