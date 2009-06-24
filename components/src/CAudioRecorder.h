#include <portaudio.h>
#include <sndfile.h>

#define SAMPLE_RATE         (44100)
#define SAMPLE_SILENCE      (0.0f)
#define FRAMES_PER_BUFFER   (1024)
#define NUM_SECONDS         (5)
#define NUM_CHANNELS        (2)
#define PA_SAMPLE_TYPE      paFloat32

char *filename;
SNDFILE *outfile;
PaStream *stream;
