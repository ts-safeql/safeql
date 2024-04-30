<p align="center">
  <img src="/docs/public/safeql-og.jpg">
</p>
<p align="center">
  SafeQL - Automatic Type Inference & Validation for PostgreSQL Queries • <a href="https://safeql.dev" height="50px">Get started</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ts-safeql/eslint-plugin">
    <img src="https://badge.fury.io/js/@ts-safeql%2Feslint-plugin.svg" alt="npm version" />
  </a>
</p>

https://user-images.githubusercontent.com/10504365/192807716-6a4fcbc1-9dc8-4d3b-a63b-2c95c0061689.mp4

## Features

- #### ⚡️ Automatic Type Inference & Validation:
  SafeQL automatically infers the type of the query result based on the query itself.

- #### 🖖 Compatible With Popular SQL Libraries:
  SafeQL works with any PostgreSQL client, including Prisma, Sequelize, pg, Postgres.js, and more.

- #### 🛠️ Easy To Use
  SafeQL was built in mind to be easy to use and integrate with your existing codebase.

- #### 📦 Built with Monorepos & Microservices in mind:
  SafeQL was built with monorepos and microservices in mind, and it's easy to use with multiple databases.

## Install

I would first recommend follow the instructions in the [documentation](https://www.safeql.dev/guide/getting-started.html).

```
npm install --save-dev @ts-safeql/eslint-plugin libpg-query
```

## Limitations 
Since libpg-query doesn't seem to support Windows, the only way to make SafeQL work on Windows is by using WSL2 ([see issue](https://github.com/ts-safeql/safeql/issues/80)).

## Sponsors

<p align="center">
	<a href="https://github.com/sponsors/Newbie012">
		<img src="https://cdn.jsdelivr.net/gh/newbie012/sponsors/sponsors.svg">
	</a>
</p>
