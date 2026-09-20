import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter.js';

/**
 * End-to-end run against the database in backend/.env.
 * Uses a random username each run so it can be repeated.
 */
describe('Vote Plus API (e2e)', () => {
  let app: INestApplication<App>;
  const username = `e2e_${Date.now().toString(36)}`;
  const password = 'secret123';
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / responds with API map', () =>
    request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => expect(res.body.status).toBe('ok')));

  it('GET /candidates returns the seeded ballot', () =>
    request(app.getHttpServer())
      .get('/candidates')
      .expect(200)
      .expect((res) => expect(res.body).toHaveLength(5)));

  it('POST /auth/register rejects invalid input with 400', () =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'a!', password: '123' })
      .expect(400));

  it('POST /auth/register creates an account', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password })
      .expect(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    token = res.body.accessToken;
  });

  it('POST /auth/register rejects a duplicate username with 409', () =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password })
      .expect(409));

  it('POST /auth/login rejects a wrong password with 401', () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'wrong' })
      .expect(401));

  it('GET /votes/me requires a token', () =>
    request(app.getHttpServer()).get('/votes/me').expect(401));

  it('POST /votes rejects an unknown candidate with 404', () =>
    request(app.getHttpServer())
      .post('/votes')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 9999 })
      .expect(404));

  it('POST /votes casts a ballot', () =>
    request(app.getHttpServer())
      .post('/votes')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 1 })
      .expect(201)
      .expect((res) => expect(res.body.candidateNumber).toBe(1)));

  it('POST /votes rejects a second ballot with 409', () =>
    request(app.getHttpServer())
      .post('/votes')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 2 })
      .expect(409));

  it('GET /votes/results includes the new vote', () =>
    request(app.getHttpServer())
      .get('/votes/results')
      .expect(200)
      .expect((res) => {
        expect(res.body.totalDbVotes).toBeGreaterThanOrEqual(1);
        expect(res.body.candidates).toHaveLength(5);
      }));
});
