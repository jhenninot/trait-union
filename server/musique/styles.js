// Styles musicaux proposés aux aidants : chacun est représenté par quelques artistes connus, dont
// les titres sont cherchés dans iTunes au moment de jouer (server/musique/itunes.js).
export const STYLES = {
  'Chanson française': ['Édith Piaf', 'Charles Aznavour', 'Jacques Brel', 'Georges Brassens', 'Barbara', 'Yves Montand', 'Charles Trenet'],
  'Variété française': ['Claude François', 'Joe Dassin', 'Dalida', 'Michel Sardou', 'Johnny Hallyday', 'Sheila', 'Michel Fugain', 'Mireille Mathieu'],
  'Pop et rock français': ['Jean-Jacques Goldman', 'Francis Cabrel', 'Renaud', 'Daniel Balavoine', 'Indochine', 'Téléphone', 'Jacques Dutronc'],
  'Rock et pop internationaux': ['The Beatles', 'The Rolling Stones', 'Queen', 'ABBA', 'Eagles', 'Michael Jackson', 'Elvis Presley'],
  'Rock\'n\'roll des années 50': ['Elvis Presley', 'Chuck Berry', 'Little Richard', 'Bill Haley & His Comets', 'Jerry Lee Lewis'],
  'Jazz': ['Louis Armstrong', 'Ella Fitzgerald', 'Duke Ellington', 'Django Reinhardt', 'Billie Holiday', 'Nat King Cole'],
  'Musette et accordéon': ['Yvette Horner', 'Tino Rossi', 'Andrex', 'Aimable', 'Marcel Azzola'],
  'Disco et années 70': ['Bee Gees', 'Gloria Gaynor', 'Donna Summer', 'Boney M.', 'Earth, Wind & Fire'],
  'Soul et gospel': ['Aretha Franklin', 'Ray Charles', 'Otis Redding', 'Whitney Houston', 'Stevie Wonder'],
  'Musiques latines': ['Los Machucambos', 'Luis Mariano', 'Julio Iglesias', 'Gipsy Kings', 'Enrico Macias'],
  'Country': ['Johnny Cash', 'Dolly Parton', 'Kenny Rogers', 'Willie Nelson', 'Hugues Aufray']
}
export const NOMS_STYLES = Object.keys(STYLES)
