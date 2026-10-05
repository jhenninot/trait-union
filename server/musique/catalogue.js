// Chansons proposées dans le quiz musical, classées par année de sortie. Les extraits de 30 secondes
// sont cherchés à la demande dans le catalogue iTunes (server/musique/itunes.js) : rien n'est stocké.
// Pour en ajouter : [titre, artiste, année]. L'artiste doit s'écrire comme dans le catalogue.
const CHANSONS = [
  ['La Vie en rose', 'Édith Piaf', 1947], ['La Mer', 'Charles Trenet', 1946], ['Douce France', 'Charles Trenet', 1943],
  ['Petit Papa Noël', 'Tino Rossi', 1946], ['Les Trois Cloches', 'Les Compagnons de la chanson', 1946],
  ['Hymne à l\'amour', 'Édith Piaf', 1950], ['Padam, padam', 'Édith Piaf', 1951], ['Sous le ciel de Paris', 'Édith Piaf', 1951],
  ['Mon manège à moi', 'Édith Piaf', 1958], ['Milord', 'Édith Piaf', 1959], ['Ne me quitte pas', 'Jacques Brel', 1959],
  ['Le Chanteur de Mexico', 'Luis Mariano', 1951], ['La Mauvaise Réputation', 'Georges Brassens', 1952], ['Le Gorille', 'Georges Brassens', 1952],
  ['Rock Around the Clock', 'Bill Haley & His Comets', 1954], ['Heartbreak Hotel', 'Elvis Presley', 1956], ['Bambino', 'Dalida', 1956],
  ['Le Poinçonneur des Lilas', 'Serge Gainsbourg', 1958], ['L\'Eau vive', 'Guy Béart', 1958],

  ['Non, je ne regrette rien', 'Édith Piaf', 1960], ['Les Enfants du Pirée', 'Dalida', 1960], ['Il faut savoir', 'Charles Aznavour', 1961],
  ['Et maintenant', 'Gilbert Bécaud', 1961], ['Santiano', 'Hugues Aufray', 1961], ['Les Comédiens', 'Charles Aznavour', 1962],
  ['Tous les garçons et les filles', 'Françoise Hardy', 1962], ['Retiens la nuit', 'Johnny Hallyday', 1962], ['L\'École est finie', 'Sheila', 1963],
  ['La Mamma', 'Charles Aznavour', 1963], ['La Javanaise', 'Serge Gainsbourg', 1963], ['Syracuse', 'Henri Salvador', 1963],
  ['Si j\'avais un marteau', 'Claude François', 1963], ['Hier encore', 'Charles Aznavour', 1964], ['Les Copains d\'abord', 'Georges Brassens', 1964],
  ['La Montagne', 'Jean Ferrat', 1964], ['Nathalie', 'Gilbert Bécaud', 1964], ['Le Pénitencier', 'Johnny Hallyday', 1964],
  ['La plus belle pour aller danser', 'Sylvie Vartan', 1964], ['Les Filles de mon pays', 'Enrico Macias', 1964],
  ['Poupée de cire, poupée de son', 'France Gall', 1965], ['La Bohème', 'Charles Aznavour', 1965], ['Aline', 'Christophe', 1965],
  ['Capri, c\'est fini', 'Hervé Vilard', 1965], ['Toulouse', 'Claude Nougaro', 1967], ['Armstrong', 'Claude Nougaro', 1965],
  ['Yesterday', 'The Beatles', 1965], ['(I Can\'t Get No) Satisfaction', 'The Rolling Stones', 1965],
  ['Les Sucettes', 'France Gall', 1966], ['Et moi, et moi, et moi', 'Jacques Dutronc', 1966], ['Les Playboys', 'Jacques Dutronc', 1966],
  ['Comme d\'habitude', 'Claude François', 1967], ['Emmenez-moi', 'Charles Aznavour', 1967], ['Sarah', 'Serge Reggiani', 1967],
  ['Hey Jude', 'The Beatles', 1968], ['Que je t\'aime', 'Johnny Hallyday', 1969], ['Aux Champs-Élysées', 'Joe Dassin', 1969],
  ['Le Métèque', 'Georges Moustaki', 1969], ['Ma France', 'Jean Ferrat', 1969], ['Un jour, un enfant', 'Frida Boccara', 1969],

  ['Avec le temps', 'Léo Ferré', 1970], ['Laisse-moi t\'aimer', 'Mike Brant', 1971], ['Aimer à perdre la raison', 'Jean Ferrat', 1971],
  ['Imagine', 'John Lennon', 1971], ['Pour un flirt', 'Michel Delpech', 1971], ['San Francisco', 'Maxime Le Forestier', 1972],
  ['Le Lundi au soleil', 'Claude François', 1972], ['Une belle histoire', 'Michel Fugain', 1972], ['Paroles, paroles', 'Dalida', 1973],
  ['Il venait d\'avoir 18 ans', 'Dalida', 1973], ['Vanina', 'Dave', 1973], ['Je suis malade', 'Serge Lama', 1973],
  ['Fais comme l\'oiseau', 'Michel Fugain', 1973], ['Le Téléphone pleure', 'Claude François', 1974], ['Les Mots bleus', 'Christophe', 1974],
  ['Gigi l\'amoroso', 'Dalida', 1974], ['L\'Été indien', 'Joe Dassin', 1975], ['Le Sud', 'Nino Ferrer', 1975], ['Hexagone', 'Renaud', 1975],
  ['La Ballade des gens heureux', 'Gérard Lenorman', 1975], ['Bohemian Rhapsody', 'Queen', 1975], ['Mamma Mia', 'ABBA', 1975],
  ['Dancing Queen', 'ABBA', 1976], ['Hotel California', 'Eagles', 1976], ['Il était une fois nous deux', 'Joe Dassin', 1976],
  ['Je vais t\'aimer', 'Michel Sardou', 1976], ['Gabrielle', 'Johnny Hallyday', 1976], ['Alexandrie Alexandra', 'Claude François', 1977],
  ['Petite Marie', 'Francis Cabrel', 1977], ['Ça plane pour moi', 'Plastic Bertrand', 1977], ['Stayin\' Alive', 'Bee Gees', 1977],
  ['Laisse béton', 'Renaud', 1977], ['Le Chanteur', 'Daniel Balavoine', 1978], ['I Will Survive', 'Gloria Gaynor', 1978],
  ['Je l\'aime à mourir', 'Francis Cabrel', 1979],

  ['Marche à l\'ombre', 'Renaud', 1980], ['Les Lacs du Connemara', 'Michel Sardou', 1981], ['On va s\'aimer', 'Gilbert Montagné', 1981],
  ['Résiste', 'France Gall', 1981], ['L\'Aventurier', 'Indochine', 1982], ['Africa', 'Toto', 1982], ['Thriller', 'Michael Jackson', 1982],
  ['Quand la musique est bonne', 'Jean-Jacques Goldman', 1982], ['Billie Jean', 'Michael Jackson', 1983], ['Mourir sur scène', 'Dalida', 1983],
  ['Every Breath You Take', 'The Police', 1983], ['Sweet Dreams (Are Made of This)', 'Eurythmics', 1983], ['Femme libérée', 'Cookie Dingler', 1984],
  ['Besoin de rien, envie de toi', 'Peter & Sloane', 1984], ['Un autre monde', 'Téléphone', 1984], ['Like a Virgin', 'Madonna', 1984],
  ['L\'Aziza', 'Daniel Balavoine', 1985], ['Mistral gagnant', 'Renaud', 1985], ['Je te donne', 'Jean-Jacques Goldman', 1985],
  ['Quelque chose de Tennessee', 'Johnny Hallyday', 1985], ['Take On Me', 'a-ha', 1985], ['Les Démons de minuit', 'Images', 1986],
  ['Voyage voyage', 'Desireless', 1986], ['Joe le taxi', 'Vanessa Paradis', 1987], ['Ella, elle l\'a', 'France Gall', 1987],
  ['Il changeait la vie', 'Jean-Jacques Goldman', 1987], ['Ne partez pas sans moi', 'Céline Dion', 1988], ['Né quelque part', 'Maxime Le Forestier', 1988],
  ['Casser la voix', 'Patrick Bruel', 1989], ['Hélène', 'Roch Voisine', 1989],

  ['En chantant', 'Michel Sardou', 1990], ['D\'amour ou d\'amitié', 'Céline Dion', 1992], ['Foule sentimentale', 'Alain Souchon', 1993],
  ['Sensualité', 'Axelle Red', 1993], ['La Corrida', 'Francis Cabrel', 1994], ['Pour que tu m\'aimes encore', 'Céline Dion', 1995],
  ['Wonderwall', 'Oasis', 1995], ['Aïcha', 'Khaled', 1996], ['My Heart Will Go On', 'Céline Dion', 1997], ['Allumer le feu', 'Johnny Hallyday', 1998],
  ['Belle', 'Garou', 1998], ['Mambo No. 5', 'Lou Bega', 1999],

  ['En apesanteur', 'Calogero', 2002], ['Sous le vent', 'Garou', 2003], ['Ma philosophie', 'Amel Bent', 2004], ['Toi + Moi', 'Grégoire', 2008],
  ['Alors on danse', 'Stromae', 2009], ['Je veux', 'Zaz', 2010], ['Rolling in the Deep', 'Adele', 2010], ['Papaoutai', 'Stromae', 2013],
  ['Dernière danse', 'Indila', 2014]
].map(([titre, artiste, annee]) => ({ titre, artiste, annee }))

export default CHANSONS

// Chansons sorties quand la personne avait entre 15 et 30 ans (années de jeunesse, les plus
// vivaces dans la mémoire) ; élargit la fenêtre s'il y en a trop peu, ou prend les années 60 à 80
// quand la date de naissance n'est pas connue.
export function chansonsDeJeunesse(anneeNaissance, minimum = 12) {
  let debut = anneeNaissance ? anneeNaissance + 15 : 1960
  let fin = anneeNaissance ? anneeNaissance + 30 : 1985
  let liste = CHANSONS.filter((c) => c.annee >= debut && c.annee <= fin)
  for (let i = 0; liste.length < minimum && i < 5; i++) {
    debut -= 3
    fin += 3
    liste = CHANSONS.filter((c) => c.annee >= debut && c.annee <= fin)
  }
  return liste.length >= minimum ? liste : CHANSONS
}
