all: bin

bin: third_party
	cd protoc-gen-ts && go install

.PHONY: test
test: bin
	for dir in lib test conformance; do \
		$(MAKE) -C $$dir test; \
	done

clean:
	for dir in third_party test; do \
		$(MAKE) -C $$dir clean; \
	done

.PHONY: third_party
third_party:
	for dir in third_party; do \
		$(MAKE) -C $$dir; \
	done
