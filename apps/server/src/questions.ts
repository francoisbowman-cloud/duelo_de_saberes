export type Question = {
  id: string;
  category: string;
  prompt: string;
  type: "mcq" | "word";
  options?: string[];
  correctIndex?: number;
  acceptedAnswers?: string[];
  fact: string;
};

export const questions: Question[] = [
  {
    id: "geo-001",
    category: "Geografía",
    prompt: "¿Cuál es la capital de la República Dominicana?",
    type: "mcq",
    options: ["Santiago", "Santo Domingo", "La Romana", "Puerto Plata"],
    correctIndex: 1,
    fact: "Santo Domingo fue fundada en 1496 y es uno de los asentamientos europeos más antiguos de América.",
  },
  {
    id: "sci-001",
    category: "Ciencia",
    prompt: "¿Qué planeta es conocido como el planeta rojo?",
    type: "word",
    acceptedAnswers: ["marte"],
    fact: "El tono rojizo de Marte se debe al óxido de hierro presente en su superficie.",
  },
  {
    id: "hist-001", category: "Historia", prompt: "¿En qué año llegó el ser humano a la Luna?", type: "mcq",
    options: ["1959", "1969", "1979", "1989"], correctIndex: 1,
    fact: "Apollo 11 alunizó el 20 de julio de 1969; Neil Armstrong y Buzz Aldrin caminaron sobre la superficie.",
  },
  {
    id: "tech-001", category: "Tecnología", prompt: "¿Qué significan las siglas HTML?", type: "mcq",
    options: ["HyperText Markup Language", "High Transfer Machine Link", "Home Tool Markup Logic", "Hyperlink Text Machine Language"], correctIndex: 0,
    fact: "HTML estructura el contenido de la web; CSS define su presentación y JavaScript su comportamiento.",
  },
  {
    id: "nature-001", category: "Naturaleza", prompt: "¿Cuál es el animal terrestre más rápido?", type: "word",
    acceptedAnswers: ["guepardo", "chita"],
    fact: "El guepardo puede superar los 100 km/h durante carreras cortas.",
  },
  {
    id: "art-001", category: "Arte y literatura", prompt: "¿Quién escribió Don Quijote de la Mancha?", type: "word",
    acceptedAnswers: ["miguel de cervantes", "cervantes", "miguel de cervantes saavedra"],
    fact: "La primera parte de la obra se publicó en 1605 y la segunda en 1615.",
  },
  {
    id: "sport-001", category: "Deportes", prompt: "¿Cuántos jugadores tiene un equipo de fútbol en el campo al comenzar un partido?", type: "mcq",
    options: ["9", "10", "11", "12"], correctIndex: 2,
    fact: "Cada equipo comienza con once jugadores, incluido el guardameta.",
  },
  {
    id: "sci-002", category: "Ciencia", prompt: "¿Cuál es el símbolo químico del oro?", type: "word",
    acceptedAnswers: ["au"],
    fact: "Au proviene del latín aurum, que significa oro.",
  },
  {
    id: "geo-002", category: "Geografía", prompt: "¿Cuál es el océano más grande del planeta?", type: "mcq",
    options: ["Atlántico", "Índico", "Ártico", "Pacífico"], correctIndex: 3,
    fact: "El océano Pacífico cubre más superficie que todas las masas terrestres juntas.",
  },
  {
    id: "pop-001", category: "Cultura pop", prompt: "¿Cómo se llama la escuela de magia de Harry Potter?", type: "word",
    acceptedAnswers: ["hogwarts"],
    fact: "Hogwarts se divide en cuatro casas: Gryffindor, Hufflepuff, Ravenclaw y Slytherin.",
  },
];
