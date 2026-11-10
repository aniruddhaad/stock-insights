# Stock Insights – Investment Analytics & Decision Support Platform

> **Full-stack Wealth Analytics & Investment Decision Platform**

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![Vanilla JavaScript](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-47A248?logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)
![Render](https://img.shields.io/badge/Hosted%20on-Render-7B3FE4?logo=render&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-Authentication-black?logo=jsonwebtokens)
![OpenAPI](https://img.shields.io/badge/OpenAPI-Documentation-6BA539?logo=openapiinitiative&logoColor=white)
**🌐 Live Demo:** https://stock-insights-8vde.onrender.com/dashboard

**💻 Source Code:** https://github.com/aniruddhaad/stock-insights

Stock Insights is a full-stack web application that helps investors analyze their portfolios beyond basic profit and loss. It combines portfolio analytics, allocation analysis, sell-decision support, scenario projections, broker transaction imports, and explainable portfolio decisions and auxiliary news-sentiment signals.

---

### 🌐 Live Demo

https://stock-insights-8vde.onrender.com/dashboard

### 💻 Source Code

https://github.com/aniruddhaad/stock-insights

---

## Technology Stack

| Layer | Technologies |
|--------|--------------|
| Frontend | Static HTML, CSS, vanilla JavaScript, Bootstrap |
| Backend | Node.js, Express.js |
| Database | MongoDB |
| Authentication | JWT |
| API Documentation | OpenAPI, Swagger |
| Testing | Node.js built-in node:test |
| Deployment | Render |

---

# Table of Contents

- Project Overview
- Why Stock Insights?
- Features
- Architecture
- Technology Stack
- Broker Integration & Portfolio Import
- Portfolio Decision Engine
- News Sentiment & Decision Explanations
- Project Structure
- Getting Started
- Environment Variables
- API Documentation
- OpenAPI & Swagger
- Testing
- Future Roadmap
- Lessons Learned
- License

# Project Overview

Most portfolio applications answer simple questions such as:

- What is my current portfolio value?
- What is my profit or loss?

Stock Insights was created to answer more meaningful investment questions:

- Which positions are contributing the most to portfolio risk?
- Which holdings are overexposed?
- Which positions deserve additional investment?
- Which positions should be reduced?
- How might my portfolio perform under different growth scenarios?
- How does inflation affect future portfolio value?
- What signals can be derived from historical portfolio performance?

Instead of acting as a trading platform, Stock Insights focuses on **investment decision support** by combining portfolio analytics, scoring models, scenario projections, and decision explanations and primary-driver reasoning into a single application.

# Why I Built This

While exploring investment tools, I found that many portfolio applications focused primarily on displaying holdings and profit/loss.

Very few attempted to explain *why* a portfolio looked healthy or unhealthy, identify concentration risks, or provide decision-oriented insights.

This project began as an experiment to build a richer portfolio analytics platform capable of combining:

- Portfolio analytics
- Allocation analysis
- Scenario projections
- Historical transaction analysis
- Decision-support scoring
- decision explanations and primary-driver reasoning

The project also became an opportunity to explore practical software architecture using browser-native HTML/CSS/JavaScript, Node.js, Express, MongoDB, REST APIs, JWT authentication, and modular backend design.

# Features

Stock Insights combines portfolio management, investment analytics, and decision-support capabilities into a single platform.

### Portfolio Management

- Secure user registration and authentication using JWT.
- Maintain multiple stock holdings within a portfolio.
- Add, update and remove positions.
- Track investment amount, current value and unrealized profit/loss.

### Portfolio Analytics

The platform automatically calculates:

- Total investment
- Current portfolio value
- Profit/Loss (₹ and %)
- Portfolio allocation by holding
- Holding duration
- Long-term vs short-term classification

### Portfolio Decision Support

Rather than displaying raw numbers alone, the application evaluates each position using multiple portfolio signals and generates decision-oriented insights.

Examples include:

- Concentration risk
- Allocation analysis
- Portfolio rankings
- Position scoring
- decision explanations and primary-driver reasoning
- Confidence indicators

### Scenario Projection

Estimate potential future portfolio value using multiple growth scenarios:

- Conservative
- Moderate
- Aggressive

Optional inflation adjustment provides both nominal and inflation-adjusted projections.

### Broker Portfolio Import

Supports importing transaction history using broker-specific Excel templates.

Current implementation includes:

- Samco XLSX import and Samco/Zerodha/generic CSV provider adapters.
- Samco and Zerodha broker API provider foundations; production readiness and API permissions require provider-contract verification.

The imported transaction history enables significantly richer portfolio analytics than relying solely on broker holdings APIs.

### REST API

The backend exposes RESTful APIs covering:

- Authentication
- Portfolio Management
- Portfolio Analytics
- Sell Analysis
- Scenario Projection
- Portfolio Insights

# Architecture

Stock Insights follows a layered architecture that separates presentation, business logic and persistence.

```text
                    Browser UI (HTML / JS)
                           │
                           ▼
                  Express REST API
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
 Authentication      Portfolio Services   Broker Import
        │                  │                  │
        └──────────────┬───┴──────────────────┘
                       ▼
             Portfolio Decision Engine
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
 Sell Analysis   Scenario Engine   AI Insights
                       │
                       ▼
                    MongoDB
```

The architecture intentionally keeps responsibilities separated so that each service focuses on a single concern.

Business logic is isolated from HTTP controllers, making the codebase easier to maintain, test and extend.

Current-state architecture and delivery source of truth: [Architecture](docs/architecture.md) and [Engineering Roadmap](docs/roadmap.md). The Screener fundamental-analysis modules currently exist as standalone/import foundations and are not yet connected to live portfolio scoring.


# Technology Stack

## Frontend

### Browser UI

The current frontend is served as static HTML pages with CSS, vanilla JavaScript page modules, and Bootstrap. It is not a React application.

---

## Backend

### Node.js

Node.js provides an event-driven runtime that is well suited for REST APIs and asynchronous processing.

### Express.js

Express was selected because it provides a lightweight framework with minimal overhead while allowing the application architecture to remain modular.

---

## Database

### MongoDB

MongoDB stores portfolio holdings, users and investment-related data.

Its document model fits naturally with portfolio objects and allows the schema to evolve as new analytics are introduced.

---

## Authentication

### JWT

JWT-based authentication secures all protected APIs while keeping the backend stateless.

---

## Documentation

OpenAPI specifications are included for the REST APIs, making the endpoints easier to understand and integrate.

---

## Deployment

The application is deployed on Render, providing a publicly accessible environment for demonstration and testing.


# Broker Integration & Portfolio Import

## Why both Broker Connection and Portfolio Import?

While developing Stock Insights, an important limitation became apparent.

Most broker APIs reliably provide **current holdings**, but often do not expose the complete historical transaction data required for meaningful portfolio analytics.

Examples of information that may be unavailable include:

- Original purchase date
- Multiple purchase lots
- Historical buy/sell transactions
- Complete acquisition timeline

However, many investment insights depend on historical transactions rather than current holdings alone.

Examples include:

- Holding duration
- Long-term vs short-term classification
- Sell decision analysis
- Portfolio scenario projections
- Investment decision scoring

To overcome this limitation, Stock Insights introduces a broker-specific transaction import pipeline.

## Current Implementation

### Broker Connection

Designed as the foundation for future broker integrations.

Responsibilities include:

- Connecting supported broker accounts
- Retrieving current holdings
- Supporting future automated synchronization

### Portfolio Import

Currently supports importing historical transactions using a broker-specific Excel template.

Current implementation:

- Samco XLSX import and Samco/Zerodha/generic CSV provider adapters.
- Samco and Zerodha broker API provider foundations; production readiness and API permissions require provider-contract verification.

By reconstructing transaction history, the application generates richer portfolio analytics than holdings-only integrations.

This design decision prioritizes analytical accuracy over incomplete automation.

# Portfolio Decision Engine

One of the primary goals of Stock Insights is to move beyond displaying portfolio statistics and instead provide meaningful investment insights.

The Portfolio Decision Engine combines multiple portfolio signals to generate a consolidated view of each holding and identify positions that may deserve further attention.

The objective is **not to make investment decisions on behalf of the user**, but to present data in a structured way that supports better decision-making.

## Inputs Considered

The decision engine evaluates several portfolio characteristics, including:

- Portfolio allocation percentage
- Current profit or loss
- Unrealized return
- Holding duration
- Position size
- Portfolio concentration
- Investment diversification
- Historical transaction data
- User-defined assumptions

As additional analytics are introduced, the decision engine is designed to evolve without requiring major architectural changes.

## Decision Categories

Depending on the available portfolio data, the application may generate observations such as:

- Portfolio appears well diversified
- Position allocation exceeds recommended threshold
- Position has become overweight
- Portfolio concentration risk detected
- Position may deserve additional review
- Long-term holding identified
- Potential rebalance opportunity

These observations are intended to support investment analysis rather than provide financial advice.

---

# News Sentiment & Decision Explanations

Stock Insights generates deterministic decision explanations from portfolio data and can consume auxiliary news-sentiment output.

Rather than presenting only numerical values, the platform converts analytical results into summaries that are easier for investors to understand.

Examples include:

- Portfolio health summaries
- Allocation explanations
- Concentration observations
- Sell decision reasoning
- Scenario interpretation

News sentiment is an auxiliary input; it does not replace deterministic calculations.

All analytical calculations continue to originate from the application's own business logic.

The current auxiliary classifier is keyword-based and uses mock headline defaults; it is not a production LLM or verified live-news pipeline.

---

# Project Structure

```text
stock-insights/
│
├── ai-news-service/          Auxiliary keyword-based news sentiment service
│
├── docs/                     Project documentation
│
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── app.js
│
├── tests/
│
├── .env.example
│
├── package.json
│
└── README.md
```

The project follows a modular structure that separates routing, business logic, persistence and supporting utilities.

Keeping these responsibilities isolated makes the codebase easier to extend and maintain as additional analytics and services are introduced.

---

# Getting Started

## Prerequisites

Before running the application, ensure the following software is installed:

- Node.js
- npm
- MongoDB
- Git

---

## Clone Repository

```bash
git clone https://github.com/aniruddhaad/stock-insights.git

cd stock-insights
```

---

## Install Dependencies

```bash
npm install
```

---

## Configure Environment Variables

Create a `.env` file using the provided template.

```text
cp .env.example .env
```

Update the environment variables as required for your local environment.

---

## Start the Application

Backend

```bash
npm start
```

AI News Service

```bash
npm run start:ai-news
```

The application will now be available locally.


# Environment Variables

The application uses environment variables to keep configuration separate from the source code.

Typical configuration includes:

| Variable | Description |
|----------|-------------|
| PORT | Express application port |
| MONGO_URI | MongoDB connection string |
| JWT_SECRET | Secret used for JWT authentication |
| JWT_EXPIRES_IN | JWT expiration period |

| MONGO_DB_NAME | MongoDB database name |
| AI_NEWS_SERVICE_URL | Auxiliary sentiment service URL |
| AI_NEWS_SERVICE_PORT | Auxiliary sentiment service port |
| AI_NEWS_TIMEOUT_MS | Sentiment request timeout |
| MARKET_DATA_TIMEOUT_MS | Market data request timeout |
| DEFAULT_SCENARIO_YEARS | Default scenario horizon |
| DEFAULT_INFLATION_RATE | Default inflation assumption |
| LONG_TERM_HOLDING_DAYS | Long-term holding threshold |
| NODE_ENV | Runtime environment |

> **Important**
>
> Never commit `.env` files containing production credentials.
> Only `.env.example` should be committed to source control.

---

# REST API

The backend exposes RESTful APIs that power the static browser frontend.

Major API groups include:

- Authentication
- User Management
- Portfolio Management
- Holdings
- Portfolio Analytics
- Portfolio Insights
- Sell Analysis
- Scenario Projection
- Health Check

The APIs follow REST principles and exchange data using JSON.

---

# OpenAPI Documentation

The project includes OpenAPI specifications to document the available endpoints.

The documentation provides:

- Endpoint descriptions
- Request parameters
- Response payloads
- Authentication requirements
- Error responses

Keeping the API specification synchronized with implementation makes the application easier to understand and integrate.

---

# Testing

The project uses Node.js built-in node:test (not Jest). The current local suite contains 17 *.test.js files and the latest audit run passed 118 tests. A separate Samco Excel integration test is available through npm run test:integration:samco.

Coverage includes decision consistency, classification, fundamental-analysis modules, scoring, market-data fallback, broker/CSV ingestion, FIFO reconstruction, Screener parsing/import, scenarios, sell analysis, transactions, and UI formatting. HTTP/API integration, security, browser smoke tests, and clean-clone CI coverage remain incomplete. See docs/test-coverage-review.md.

---

# Design Principles

Several architectural principles guided the implementation of Stock Insights.

## Separation of Concerns

Routing, business logic and persistence are kept independent.

## Modular Design

Business functionality is divided into reusable services that can evolve independently.

## REST-first Development

The backend is designed around REST APIs, allowing multiple client applications to consume the same services.

## Incremental Evolution

Rather than attempting to build every feature up front, the application has evolved incrementally as new requirements and ideas emerged.

This approach allowed the architecture to remain flexible while continuously improving the platform.

---

# Lessons Learned

Developing Stock Insights provided several practical insights beyond the implementation itself.

## Historical data matters

Current portfolio holdings alone are insufficient for meaningful investment analytics.

Supporting historical transaction imports significantly improved the quality of portfolio analysis.

---

## Business logic deserves its own layer

Keeping portfolio calculations separate from controllers made the application easier to test, extend and maintain.

---

## AI works best as an assistant

Portfolio calculations and position decisions are deterministic. The auxiliary AI News service currently uses keyword-based headline classification and mock headlines by default; it is not a production LLM or verified live-news pipeline. Natural-language explanations and sentiment inputs must be treated according to their actual provenance.

---

## Building incrementally improves architecture

Many of the platform's capabilities emerged gradually.

Each iteration highlighted opportunities to simplify the design, improve separation of concerns and reduce future complexity.

---

# Future Roadmap

The project will continue evolving as new capabilities are explored.

The prioritized roadmap is maintained in docs/roadmap.md. Current high-priority work includes:

- Security hardening (JWT secret validation, broker credential encryption, CORS allowlist, rate limiting, debug-route protection)
- Making all intended tests reproducible from a clean GitHub clone and adding CI
- Completing API/OpenAPI contract parity
- Wiring Screener fundamentals and the score adapter into the live portfolio decision flow
- Designing a separate financial-company fundamental model
- Market-data freshness and live/stored/mock provenance controls
- Replacing mock news inputs with traceable current-news sources
- Verifying Samco and Zerodha provider contracts and reconciliation

Longer-term product work includes dividends/corporate actions, portfolio benchmarking, advanced risk analytics, rebalancing, goal planning, alerts and scheduled reports. Kubernetes and service decomposition are not immediate priorities.

---

# Contributing

Suggestions, bug reports and constructive feedback are always welcome.

If you identify an issue or have ideas for improving the project, feel free to open an issue or submit a pull request.

---

# License

This project is intended for learning, experimentation and portfolio demonstration.

It is provided without financial or investment advice.

Any investment decisions should be based on independent research and consultation with qualified financial professionals.


# Application Workflow

The following high-level workflow illustrates how Stock Insights processes user data.

```text
                     User Login
                          │
                          ▼
                  JWT Authentication
                          │
                          ▼
                Portfolio Dashboard
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
 Import Transactions   Manage Holdings   Portfolio Analysis
        │                 │                 │
        └────────────┬────┴─────────────────┘
                     ▼
          Portfolio Decision Engine
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
 Allocation      Sell Analysis   Scenario Projection
                     │
                     ▼
             News Sentiment
                     │
                     ▼
             Results displayed in UI
```

Each stage has a clearly defined responsibility, allowing new analytical capabilities to be introduced without affecting unrelated parts of the application.


# Portfolio Analytics

The analytics module consolidates investment information into a set of meaningful portfolio metrics.

Examples include:

- Total investment
- Current market value
- Unrealized profit/loss
- Profit percentage
- Allocation percentage
- Largest holdings
- Sector exposure (future enhancement)
- Investment concentration
- Portfolio diversification

The objective is to provide investors with a complete view of portfolio health rather than isolated financial figures.


# Sell Analysis

One of the goals of Stock Insights is to assist investors when reviewing existing positions.

The application evaluates several characteristics of a holding before presenting observations.

Examples include:

- Current profit or loss
- Holding duration
- Portfolio allocation
- Position size
- Portfolio concentration
- User assumptions

The generated observations are intended to support investment review and should not be interpreted as financial advice.


# Scenario Projection

Scenario Projection estimates the future value of a portfolio under different growth assumptions.

Supported scenarios include:

- Conservative
- Moderate
- Aggressive

Optional inflation adjustment helps compare projected returns in today's purchasing power.

The feature is intended to help investors understand long-term portfolio behaviour under multiple assumptions rather than predict future market performance.


# Security

Several security practices are incorporated into the application.

## Authentication

- JWT-based authentication
- Protected API endpoints
- Password hashing

## API Security

- Authentication middleware
- Request validation
- Error handling
- Consistent HTTP response codes

Sensitive configuration is intended to be externalized through environment variables. However, the current code still has a hard-coded JWT-secret fallback and broker credentials are stored in MongoDB without encryption at rest. These are known security gaps and must be resolved before production use.

# API Overview

The backend exposes RESTful endpoints organized by functional areas.

| Module | Purpose |
|---------|----------|
| Authentication | User registration and login |
| Portfolio | Portfolio CRUD operations |
| Holdings | Manage stock holdings |
| Analytics | Portfolio calculations |
| Insights | Decision-support observations |
| Sell Analysis | Position review |
| Scenario Projection | Future value estimation |
| Health | Service health check |

Detailed endpoint documentation is available through the OpenAPI specification.

# Engineering Decisions

Several implementation decisions were made to keep the application maintainable and extensible.

## Modular Services

Business logic is implemented within service modules rather than controllers.

This keeps HTTP handling independent from portfolio calculations.

---

## REST-first Design

All portfolio functionality is exposed through REST APIs.

This allows additional clients (mobile applications, dashboards or external integrations) to consume the same backend services.

---

## Broker Import Strategy

Rather than relying entirely on broker APIs, Stock Insights supports importing historical transaction data.

This enables richer analytics while remaining compatible with brokers that expose limited historical information.

---

## AI as an Assistant

AI is used to explain analytical results rather than generate investment recommendations.

Keeping calculations deterministic improves transparency and allows users to understand how conclusions were reached.

# Performance Considerations

Several implementation decisions were made with scalability and maintainability in mind.

## Efficient API Design

- RESTful APIs return only the data required by the client.
- JSON is used consistently across all endpoints.
- Business logic is centralized within service modules.

---

## Modular Business Logic

Portfolio calculations are isolated from HTTP controllers.

This allows analytical algorithms to evolve independently without affecting API routing or presentation logic.

---

## Future Optimizations

Potential enhancements include:

- Redis caching
- Background job processing
- AI response caching
- Scheduled portfolio analytics
- WebSocket-based live updates
- Horizontal scaling


# Error Handling

The application follows consistent error-handling practices.

Examples include:

- Invalid authentication credentials
- Expired JWT tokens
- Missing portfolio data
- Validation failures
- Invalid request payloads
- Internal server errors

Where appropriate, APIs return meaningful HTTP status codes together with descriptive JSON error responses.

This makes client-side integration simpler and improves troubleshooting.


# Logging

Application logging is designed to assist development and troubleshooting.

Typical events include:

- User authentication
- Portfolio operations
- Import processing
- API failures
- Unexpected exceptions

Future enhancements may include:

- Structured logging
- Request correlation IDs
- Centralized log aggregation


# Future Architecture

Although Stock Insights currently operates as a modular Node.js application, the architecture has been designed to support future evolution.

Possible future directions include:

- Dedicated Analytics Service
- AI Insights Service
- Notification Service
- Broker Integration Service
- Portfolio Synchronization Service

These services could communicate through asynchronous messaging while remaining independently deployable.

This approach would allow the platform to grow without introducing unnecessary complexity during the early stages of development.


# Known Limitations

The current implementation intentionally focuses on portfolio analytics rather than acting as a complete trading platform.

Current limitations include:

- Limited broker integrations
- Historical market data is not available for every scenario
- Deterministic decision explanations depend on the quality of available portfolio data
- Some analytical models are intentionally conservative while additional validation is performed
- Mobile experience can be further improved

These limitations have been accepted to keep the project focused on portfolio analytics and decision support.


# Acknowledgements

This project makes use of several excellent open-source technologies.

Special thanks to the maintainers of:

- Bootstrap
- Node.js
- Express.js
- MongoDB
- JWT
- OpenAPI
- Swagger

Their tools make projects like this possible.


# About the Author

Hi, I'm **Aniruddha Deshpande**.

I'm a Technical Architect with over 21 years of software engineering experience, specializing in backend platforms, enterprise application architecture, API design and e-commerce systems.

Stock Insights was created as a hands-on project to explore modern full-stack development, investment analytics and AI-assisted software engineering.

If you'd like to connect or discuss the project, feel free to reach out.

- GitHub: https://github.com/aniruddhaad
- LinkedIn: *https://www.linkedin.com/in/aniruddhad/*


# Final Notes

Stock Insights continues to evolve as new ideas are explored.

The primary objective is not simply to build another portfolio tracker, but to create a practical platform that demonstrates modern software engineering, clean architecture and thoughtful investment analytics.

Feedback, suggestions and constructive discussions are always welcome.

---

## Current implementation status (10 November 2026)

The following distinctions are important when evaluating the current release:

- The browser frontend is static HTML/CSS/vanilla JavaScript with Bootstrap, not React.
- Tests run with Node.js built-in node:test, not Jest.
- Fundamental data import, analysis and score-adapter modules exist, but call-site inspection confirms they are not connected to the live portfolio decision path. The current fundamentalScore component is derived from holding duration. Financial-company fundamental analysis is not implemented.
- The separate AI News service currently uses keyword sentiment classification and mock headline defaults; it is not a verified live-news or production LLM pipeline.
- Market data can fall back to stored or mock prices. The source must be checked before treating a quote as current.
- Broker credentials are currently stored without encryption at rest, the JWT secret has a hard-coded fallback, and CORS is unrestricted. These are release-blocking security gaps for production use.

See [Architecture](docs/architecture.md) for the current system design and [Engineering Roadmap](docs/roadmap.md) for prioritized work.
