export type WordPair = { first: string; second: string; category: string; difficulty: "easy" | "medium" | "hard" };

const raw: Array<[string, string, string, WordPair["difficulty"]]> = [
  ["playa","piscina","lugares","easy"],["café","chocolate caliente","bebidas","easy"],["perro","lobo","animales","easy"],["gato","tigre","animales","easy"],["avión","helicóptero","transportes","easy"],
  ["río","lago","naturaleza","easy"],["pizza","lasaña","comida","easy"],["fútbol","baloncesto","deportes","easy"],["sol","luna","espacio","easy"],["cine","teatro","entretenimiento","easy"],
  ["tenedor","cuchara","cocina","easy"],["camisa","chaqueta","ropa","easy"],["manzana","pera","frutas","easy"],["montaña","volcán","naturaleza","easy"],["doctor","enfermero","profesiones","easy"],
  ["guitarra","violín","música","medium"],["libro","revista","lectura","easy"],["tren","metro","transportes","easy"],["reloj","cronómetro","objetos","medium"],["isla","península","geografía","medium"],
  ["trueno","explosión","sonidos","medium"],["miel","caramelo","sabores","easy"],["desierto","sabana","naturaleza","medium"],["detective","periodista","profesiones","medium"],["robot","androide","tecnología","medium"],
  ["castillo","palacio","edificios","easy"],["brújula","mapa","viajes","medium"],["tormenta","huracán","clima","medium"],["diamante","cristal","materiales","medium"],["biblioteca","museo","lugares","easy"],
  ["sueño","recuerdo","mente","hard"],["orgullo","vanidad","emociones","hard"],["valentía","imprudencia","carácter","hard"],["justicia","venganza","ideas","hard"],["silencio","soledad","sensaciones","hard"],
  ["talento","práctica","habilidades","hard"],["azar","destino","ideas","hard"],["secreto","mentira","comunicación","hard"],["intuición","instinto","mente","hard"],["rutina","tradición","costumbres","hard"],
  ["brisa","viento","clima","medium"],["cueva","túnel","lugares","medium"],["semilla","huevo","orígenes","hard"],["espejo","ventana","objetos","medium"],["farol","linterna","objetos","easy"],
  ["pirata","corsario","historia","hard"],["poema","canción","arte","medium"],["abeja","avispa","animales","medium"],["queso","mantequilla","comida","easy"],["camino","sendero","lugares","easy"]
];

export const wordPairs: WordPair[] = raw.map(([first, second, category, difficulty]) => ({ first, second, category, difficulty }));
