ZTR ANALYTICS SERVER - Node 24

COMO RODAR:
1. Extraia o ZIP
2. Abra CMD dentro da pasta
3. Rode: npm install
4. Rode: npm start
5. Acesse: http://localhost:4000

ACESSAR NA REDE LOCAL:
No PC servidor, rode: ipconfig
Pegue o IPv4, exemplo 192.168.1.168
No outro PC/celular da mesma rede: http://192.168.1.168:4000

SENHA ADMIN PADRAO:
123456

COMO COLOCAR NO SEU SITE:
Entre no painel, crie um site e copie o código tracker.
Cole antes de fechar o </body> do seu site.

PORTA PADRAO:
4000
Para mudar, edite server.js: const PORT = process.env.PORT || 4000;
