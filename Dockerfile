FROM nginx:alpine

# Copiar configuración optimizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos estáticos de la aplicación a la raíz web de Nginx
COPY . /usr/share/nginx/html

EXPOSE 80 3000

CMD ["nginx", "-g", "daemon off;"]
