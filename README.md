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

### Prerequisites
Make sure you have [ESLint](https://eslint.org/) installed in your project and that it's [configured](https://typescript-eslint.io/docs/#quickstart) to work with TypeScript.
<details>
  <summary>Prerequisites for Windows</summary>

  - Python should be installed
  - Visual C++ build tools workload for Visual Studio 2022

  You can use **Chocolatey** Package Manager ([See Installation / Setup](https://docs.chocolatey.org/en-us/choco/setup/))
  ```bash
  choco install python visualstudio2022-workload-vctools -y
  ```
</details>

```bash
npm install --save-dev @ts-safeql/eslint-plugin libpg-query
```

## Sponsors

<p align="center">
	<a href="https://github.com/sponsors/Newbie012">
		<img src="https://cdn.jsdelivr.net/gh/newbie012/sponsors/sponsors.svg">
	</a>
</p>
