# Contribuir a Boceli

Boceli es una aplicación sencilla creada para el uso personal de su autor. Las propuestas se valoran según sus necesidades y la sencillez del proyecto; no hay un calendario de desarrollo ni plazos de respuesta garantizados.

## Reportar un problema

Abre una issue con los pasos para reproducirlo, el resultado esperado y lo que ocurrió. Incluye la plataforma, la versión del sistema y, si corresponde, la versión de Expo Go. Puedes adjuntar capturas con datos ficticios; evita compartir claves, respaldos o información personal.

## Proponer cambios

Antes de añadir una función o hacer un cambio amplio, abre una issue para explicar el problema y la solución que propones. Prioriza cambios pequeños y relacionados con el registro personal de comidas.

Para preparar una contribución:

1. Crea un fork del repositorio y una rama para tu cambio.
2. Instala las dependencias con `bun install` y ejecuta la app con `bun start`.
3. Mantén el estilo del código existente y actualiza la documentación si cambia el uso de la app.
4. Ejecuta `bun run check`. Si modificas la app, ejecuta también `bun run export:native` y comprueba el flujo afectado en un dispositivo o emulador disponible.
5. Abre una pull request que explique el problema, el cambio y las comprobaciones realizadas. Indica qué plataformas comprobaste y cualquier limitación pendiente.

Encontrarás los requisitos y las instrucciones de desarrollo en el [README](README.md) y en la [guía de instalación](docs/installation.md).

## Licencia

Las contribuciones se incorporan bajo la [licencia MIT](LICENSE) del proyecto. Conserva los avisos de licencia de los recursos o componentes de terceros que utilices.
