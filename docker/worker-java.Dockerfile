FROM gradle:8-jdk17 AS build
WORKDIR /app
COPY workflows/java/ .
RUN gradle installDist --no-daemon

FROM eclipse-temurin:17-jre-alpine
COPY --from=build /app/build/install/worker /app
CMD ["/app/bin/worker"]
