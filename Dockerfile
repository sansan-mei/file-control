# build front-end
FROM node:lts-alpine as frontend

RUN npm install pnpm -g

WORKDIR /app

COPY ./package.json /app

COPY ./pnpm-lock.yaml /app

RUN pnpm install

COPY . /app

RUN pnpm build


# build backend
FROM node:lts-alpine as backend

RUN npm install pnpm -g

WORKDIR /app

COPY /service /app

RUN pnpm install

RUN pnpm build


FROM node:lts-alpine

RUN npm install pnpm -g

WORKDIR /app

COPY /service/package.json /app

COPY /service/pnpm-lock.yaml /app

RUN pnpm install --production && rm -rf /root/.npm /root/.pnpm-store /usr/local/share/.cache /tmp/*

COPY --from=frontend /app/dist /app/public

COPY --from=backend /app/build /app/
CMD ['mkdir', '/app/static']

EXPOSE 3003

CMD ["pnpm", "run", "prod"]