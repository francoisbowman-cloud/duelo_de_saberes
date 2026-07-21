export type Riddle = {
  id: string;
  prompt: string;
  answers: string[];
  hints: string[];
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
};

export const riddles: Riddle[] = [
  ["r01", "Cuanto más le quitas, más grande se vuelve. ¿Qué es?", ["un agujero", "agujero"], ["No es un objeto sólido.", "Puede estar en el suelo."], "Al retirar material, un agujero aumenta de tamaño.", "easy"],
  ["r02", "Tiene agujas y no cose. ¿Qué es?", ["reloj", "un reloj"], ["Mide algo.", "Puede llevarse en la muñeca."], "Las manecillas del reloj también se llaman agujas.", "easy"],
  ["r03", "Tiene dientes y no come. ¿Qué es?", ["peine", "un peine"], ["Se usa a diario.", "Ordena el cabello."], "Los dientes del peine separan el cabello.", "easy"],
  ["r04", "Sube y baja, pero siempre permanece en el mismo lugar. ¿Qué es?", ["escalera", "una escalera"], ["Conecta alturas.", "Tiene peldaños."], "La escalera permite subir y bajar sin moverse.", "easy"],
  ["r05", "Tiene ciudades sin casas, ríos sin agua y bosques sin árboles. ¿Qué es?", ["mapa", "un mapa"], ["Representa lugares.", "Puede doblarse."], "Un mapa representa esos elementos mediante símbolos.", "easy"],
  ["r06", "Si me nombras, desaparezco. ¿Qué soy?", ["silencio", "el silencio"], ["No puede oírse.", "Hablar lo rompe."], "Nombrar el silencio requiere producir sonido.", "easy"],
  ["r07", "Siempre está delante de ti, pero no puedes verlo. ¿Qué es?", ["futuro", "el futuro"], ["Aún no sucede.", "Llega con el tiempo."], "El futuro está por venir y todavía no puede verse.", "easy"],
  ["r08", "¿Qué se moja mientras seca?", ["toalla", "una toalla"], ["Está en el baño.", "Absorbe agua."], "La toalla se moja al secar otras cosas.", "easy"],
  ["r09", "Tiene cuello, pero no cabeza. ¿Qué es?", ["botella", "una botella"], ["Puede contener líquido.", "Suele tener tapa."], "La parte estrecha de una botella se llama cuello.", "easy"],
  ["r10", "Tiene un ojo, pero no puede ver. ¿Qué es?", ["aguja", "una aguja"], ["Es pequeña.", "Se usa con hilo."], "El orificio de la aguja se denomina ojo.", "easy"],
  ["r11", "Me rompen antes de usarme. ¿Qué soy?", ["huevo", "un huevo"], ["Se encuentra en la cocina.", "Tiene cáscara."], "Normalmente se rompe el huevo antes de cocinarlo.", "medium"],
  ["r12", "¿Qué palabra está siempre escrita incorrectamente en el diccionario?", ["incorrectamente"], ["La respuesta está en la pregunta.", "Es un juego de lenguaje."], "La palabra ‘incorrectamente’ siempre se escribe como tal.", "medium"],
  ["r13", "Dos padres y dos hijos comen tres panes, uno cada uno. ¿Cómo es posible?", ["abuelo padre e hijo", "abuelo, padre e hijo", "son tres: abuelo padre e hijo"], ["No son cuatro personas.", "Piensa en tres generaciones."], "Son abuelo, padre e hijo: el padre también es hijo.", "medium"],
  ["r14", "Un hombre sale bajo lluvia intensa sin paraguas ni sombrero y no se moja un solo cabello. ¿Por qué?", ["es calvo", "era calvo", "no tiene cabello"], ["La lluvia sí lo alcanza.", "Observa la última palabra."], "No se moja el cabello porque el hombre es calvo.", "medium"],
  ["r15", "¿Qué mes tiene 28 días?", ["todos", "todos los meses"], ["No pregunta cuál tiene exactamente 28.", "Revisa el calendario completo."], "Todos los meses tienen al menos 28 días.", "medium"],
  ["r16", "Una casa tiene cuatro paredes orientadas al sur y un oso pasa delante. ¿De qué color es?", ["blanco", "oso blanco"], ["La orientación revela el lugar.", "Solo es posible cerca de un polo."], "La casa está en el Polo Norte, donde los osos son polares.", "hard"],
  ["r17", "Hay tres interruptores abajo y una bombilla arriba. Solo puedes subir una vez. ¿Cómo identificas su interruptor?", ["encender uno esperar apagarlo encender otro y tocar la bombilla", "usar el calor de la bombilla"], ["La luz ofrece más de una señal.", "Piensa en temperatura."], "Enciende uno, espera, apágalo y enciende otro; arriba, luz, calor o frío identifican cada interruptor.", "hard"],
  ["r18", "Un prisionero debe elegir entre tres salas: fuego, asesinos armados y leones que no han comido en tres años. ¿Cuál es segura?", ["la de los leones", "leones"], ["Analiza cuánto pueden sobrevivir.", "Tres años es demasiado."], "Los leones habrían muerto sin comer durante tres años.", "medium"],
  ["r19", "¿Qué puedes sostener con la mano izquierda, pero nunca con la derecha?", ["codo derecho", "el codo derecho", "tu codo derecho"], ["Es parte de tu cuerpo.", "Está en el brazo opuesto."], "La mano derecha no puede sostener su propio codo.", "medium"],
  ["r20", "Un tren eléctrico viaja hacia el norte y el viento hacia el sur. ¿Hacia dónde va el humo?", ["no hay humo", "no produce humo", "ninguna parte"], ["Importa el tipo de tren.", "No usa combustible."], "Un tren eléctrico no produce humo.", "easy"],
].map(([id, prompt, answers, hints, explanation, difficulty]) => ({ id, prompt, answers, hints, explanation, difficulty })) as Riddle[];
