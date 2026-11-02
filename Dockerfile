# Hostless builds from the repository root.
# Run the upstream OpenWA gateway image as its dedicated non-root user.
FROM ghcr.io/rmyndharis/openwa:latest

# The upstream entrypoint skips chown/gosu when started as UID 997.
# This avoids Hostless's restricted-container chown failure.
USER 997:997

EXPOSE 2785
